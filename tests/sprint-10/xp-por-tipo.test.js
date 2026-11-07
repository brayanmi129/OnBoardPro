// Sprint 10 · Rango de XP por tipo de actividad: mínimo, recomendado y máximo.
const { preparar, estado } = require("../soporte/supabaseFalso.js");
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const ActivitiesService = require("../../services/actividades.js");
const { XP_REGLAS, xpFueraDeRango } = require("../../helpers/niveles.js");

const admin = { id: "a1", role: "admin", tenantId: "t1", email: "admin@t1.com" };
const base = () => preparar({
  tablas: {
    sections: [{ id: "s1", course_id: "c1", tenant_id: "t1" }],
    courses: [{ id: "c1", tenant_id: "t1", instructor: "inst@t1.com" }],
    activities: [{ id: "r1", tenant_id: "t1", section_id: "s1", type: "Recurso", xp: 10, title: "Manual", name: "r1", deliverable: false }],
    preguntas: [], intentos_examen: [], entregas: [],
  },
});
const nueva = (extra) => ({ name: "n1", title: "Nueva", description: "Una actividad de prueba", type: "Recurso", deliverable: false, sectionId: "s1", tenantId: "t1", ...extra });

describe("XP por tipo de actividad", () => {
  test("S10-36 · HU-051 · cada tipo tiene mínimo, recomendado y máximo, en ese orden", () => {
    for (const [tipo, r] of Object.entries(XP_REGLAS)) {
      assert.ok(r.minimo <= r.recomendado && r.recomendado <= r.maximo, tipo);
    }
    assert.equal(xpFueraDeRango(XP_REGLAS.Examen.maximo + 1, "Examen") !== null, true);
    assert.equal(xpFueraDeRango(XP_REGLAS.Examen.maximo, "Examen"), null);
  });

  test("S10-37 · HU-051 · sin XP, una actividad nueva toma el recomendado de su tipo", async () => {
    base();
    await ActivitiesService.create(nueva({ type: "Tarea", deliverable: true }));
    const creada = estado.tablas.activities.find((a) => a.name === "n1");
    assert.equal(creada.xp, XP_REGLAS.Tarea.recomendado);
  });

  test("S10-38 · HU-051 · crear o editar con XP fuera del rango responde 400 y no guarda", async () => {
    base();
    await assert.rejects(ActivitiesService.create(nueva({ xp: 500 })), (e) => e.status === 400 && /entre 5 y 30/.test(e.message));
    await assert.rejects(ActivitiesService.actualizar("r1", { xp: 1 }, null, admin), (e) => e.status === 400);
    assert.equal(estado.tablas.activities.find((a) => a.id === "r1").xp, 10);
  });

  test("S10-39 · HU-051 · al cambiar de tipo, un XP que queda fuera del rango pasa al recomendado", async () => {
    base();
    await ActivitiesService.actualizar("r1", { type: "Examen" }, null, admin);
    assert.equal(estado.tablas.activities.find((a) => a.id === "r1").xp, XP_REGLAS.Examen.recomendado);
  });
});

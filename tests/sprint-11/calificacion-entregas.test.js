// Sprint 11 · Ver mi calificación y retroalimentación (HU-049).
const { preparar } = require("../soporte/supabaseFalso.js");
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const EntregaService = require("../../services/entregaService.js");

const ana = { id: "u1", role: "student", tenantId: "t1" };

const base = () => preparar({
  tablas: {
    users: [
      { id: "u1", firstname: "Ana", lastname: "Ruiz", tenant_id: "t1" },
      { id: "i1", firstname: "Laura", lastname: "Gómez", tenant_id: "t1" },
    ],
    courses: [{ id: "c1", name: "Inducción", tenant_id: "t1" }],
    sections: [{ id: "s1", course_id: "c1" }],
    activities: [
      { id: "a1", title: "Política de seguridad", section_id: "s1", tenant_id: "t1" },
      { id: "a2", title: "Mapa de procesos", section_id: "s1", tenant_id: "t1" },
      { id: "a3", title: "Carta de bienvenida", section_id: "s1", tenant_id: "t1" },
    ],
    entregas: [
      { id: "e1", activity_id: "a1", user_id: "u1", tenant_id: "t1", estado: "aprobada", entregado_at: "2026-11-01T10:00:00Z", feedback: "Muy bien", revisado_por: "i1", revisado_at: "2026-11-02T10:00:00Z" },
      { id: "e2", activity_id: "a2", user_id: "u1", tenant_id: "t1", estado: "entregado", entregado_at: "2026-11-05T10:00:00Z", feedback: "Falta el anexo", revisado_por: "i1", revisado_at: "2026-11-03T10:00:00Z" },
      { id: "e3", activity_id: "a3", user_id: "u1", tenant_id: "t1", estado: "rehacer", entregado_at: "2026-11-02T09:00:00Z", feedback: "Agregá la firma", revisado_por: "i1", revisado_at: "2026-11-04T10:00:00Z" },
      { id: "e9", activity_id: "a1", user_id: "otro", tenant_id: "t1", estado: "aprobada", entregado_at: "2026-11-01T10:00:00Z" },
    ],
    xp_movimientos: [{ id: "m1", user_id: "u1", activity_id: "a1", xp: 40, motivo: "entrega_aprobada" }],
  },
});

describe("Mi calificación y retroalimentación", () => {
  test("S11-01 · HU-049 · una entrega aprobada muestra feedback, fecha, revisor y XP obtenido", async () => {
    base();
    const e = await EntregaService.miEntrega("a1", ana);
    assert.equal(e.feedback, "Muy bien");
    assert.equal(e.revisadoAt, "2026-11-02T10:00:00Z");
    assert.deepEqual(e.revisadoPor, { firstname: "Laura", lastname: "Gómez" });
    assert.equal(e.xpObtenido, 40);
  });

  test("S11-02 · HU-049 · mientras espera revisión, feedback, fecha, revisor y XP van en null", async () => {
    base();
    const e = await EntregaService.miEntrega("a2", ana);
    assert.equal(e.estado, "entregado");
    assert.deepEqual([e.feedback, e.revisadoAt, e.revisadoPor, e.xpObtenido], [null, null, null, null]);
  });

  test("S11-03 · HU-049 · una entrega para rehacer muestra el feedback y XP obtenido null", async () => {
    base();
    const e = await EntregaService.miEntrega("a3", ana);
    assert.equal(e.feedback, "Agregá la firma");
    assert.equal(e.xpObtenido, null);
  });

  test("S11-04 · HU-049 · mis entregas: solo las mías, con actividad y curso, revisadas primero", async () => {
    base();
    const r = await EntregaService.mias(ana);
    assert.deepEqual(r.map((e) => e.id), ["e3", "e1", "e2"]);
    assert.deepEqual(r[1].actividad, { id: "a1", titulo: "Política de seguridad" });
    assert.deepEqual(r[1].curso, { id: "c1", nombre: "Inducción" });
    assert.equal(r[2].feedback, null);
  });

  test("S11-05 · HU-049 · sin entregas la lista viene vacía y mi-entrega de algo no entregado es null", async () => {
    base();
    assert.deepEqual(await EntregaService.mias({ id: "nadie", role: "student", tenantId: "t1" }), []);
    assert.equal(await EntregaService.miEntrega("a1", { id: "nadie", role: "student" }), null);
  });
});

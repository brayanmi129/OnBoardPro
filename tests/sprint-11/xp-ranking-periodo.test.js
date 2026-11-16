// Sprint 11 · Detalle de mis acreditaciones (HU-056) y ranking por periodo (HU-057).
const { preparar } = require("../soporte/supabaseFalso.js");
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const GamificationService = require("../../services/gamificationService.js");
const { inicioDePeriodo } = require("../../helpers/periodo.js");

const hace = (dias) => new Date(Date.now() - dias * 86400000).toISOString();

describe("Mis movimientos de XP", () => {
  const base = () => preparar({
    tablas: {
      courses: [{ id: "c1", name: "Inducción" }],
      sections: [{ id: "s1", course_id: "c1" }],
      activities: [{ id: "a1", title: "Examen de inducción", section_id: "s1" }],
      logros: [{ id: "l1", nombre: "Primer paso", course_id: null }],
      xp_movimientos: [
        { id: "m1", user_id: "u1", activity_id: "a1", logro_id: null, xp: 25, motivo: "examen_aprobado", created_at: "2026-11-01T10:00:00Z" },
        { id: "m2", user_id: "u1", activity_id: null, logro_id: "l1", xp: 10, motivo: "logro_desbloqueado", created_at: "2026-11-02T10:00:00Z" },
        { id: "m3", user_id: "u1", activity_id: null, logro_id: null, xp: 5, motivo: "actividad_completada", created_at: "2026-10-01T10:00:00Z" },
        { id: "m4", user_id: "u2", activity_id: "a1", xp: 50, motivo: "examen_aprobado", created_at: "2026-11-03T10:00:00Z" },
      ],
    },
  });

  test("S11-06 · HU-056 · lista mis movimientos del más reciente al más antiguo con su origen", async () => {
    base();
    const { movimientos } = await GamificationService.misMovimientos("u1");
    assert.deepEqual(movimientos.map((m) => m.id), ["m2", "m1", "m3"]);
    assert.deepEqual(movimientos[1].origen, {
      tipo: "actividad", id: "a1", titulo: "Examen de inducción", curso: { id: "c1", nombre: "Inducción" },
    });
    assert.equal(movimientos[1].motivo, "examen_aprobado");
    assert.equal(movimientos[1].fecha, "2026-11-01T10:00:00Z");
  });

  test("S11-07 · HU-056 · un logro aparece como origen tipo logro con su nombre", async () => {
    base();
    const { movimientos } = await GamificationService.misMovimientos("u1");
    assert.deepEqual(movimientos[0].origen, { tipo: "logro", id: "l1", titulo: "Primer paso", curso: null });
    assert.equal(movimientos[0].xp, 10);
  });

  test("S11-08 · HU-056 · si la actividad ya no existe el origen viene igual, con id y título en null", async () => {
    base();
    const { movimientos } = await GamificationService.misMovimientos("u1");
    assert.deepEqual(movimientos[2].origen, { tipo: "actividad", id: null, titulo: null, curso: null });
  });
});

describe("Ranking por periodo", () => {
  const base = () => preparar({
    tablas: {
      groups: [{ id: "g1", tenant_id: "t1" }],
      users_groups: [{ id_user: "u1", id_group: "g1" }, { id_user: "u2", id_group: "g1" }, { id_user: "u3", id_group: "g1" }],
      groups_courses: [{ id_group: "g1", id_course: "c1" }],
      courses: [{ id: "c1", tenant_id: "t1" }],
      sections: [{ id: "s1", course_id: "c1" }],
      activities: [{ id: "a1", section_id: "s1" }, { id: "a2", section_id: "s1" }, { id: "ax", section_id: "otra" }],
      users: [
        { id: "u1", firstname: "Ana", role: "student", tenant_id: "t1", xp: 500, level: 3, status: "Active" },
        { id: "u2", firstname: "Beto", role: "student", tenant_id: "t1", xp: 100, level: 1, status: "Active" },
        { id: "u3", firstname: "Caro", role: "student", tenant_id: "t1", xp: 50, level: 0, status: "Active" },
        { id: "u4", firstname: "Dani", role: "student", tenant_id: "t1", xp: 900, level: 5, status: "Inactive" },
      ],
      xp_movimientos: [
        { id: "m1", user_id: "u1", activity_id: "a1", xp: 500, created_at: hace(400) },
        { id: "m2", user_id: "u2", activity_id: "a1", xp: 60, created_at: new Date().toISOString() },
        { id: "m3", user_id: "u2", activity_id: "ax", xp: 40, created_at: new Date().toISOString() },
      ],
    },
    rpc: (fn) => (fn === "ranking_curso"
      ? { data: [{ user_id: "u1", xp: 500 }, { user_id: "u2", xp: 60 }], error: null }
      : { data: null, error: null }),
  });

  test("S11-09 · HU-057 · con periodo semana el XP es solo el ganado desde el lunes y aparecen todos, con 0", async () => {
    base();
    const r = await GamificationService.getRanking("t1", { periodo: "semana" });
    assert.deepEqual(r.map((u) => [u.firstname, u.xp, u.posicion]), [["Beto", 100, 1], ["Ana", 0, 2], ["Caro", 0, 3]]);
    assert.equal(r[1].level, 3, "el nivel sigue siendo el total");
  });

  test("S11-10 · HU-057 · sin periodo (siempre) se usa el XP total y los inactivos no figuran", async () => {
    base();
    const r = await GamificationService.getRanking("t1", {});
    assert.deepEqual(r.map((u) => [u.firstname, u.xp]), [["Ana", 500], ["Beto", 100], ["Caro", 50]]);
  });

  test("S11-11 · HU-057 · un periodo inválido responde 400", async () => {
    base();
    await assert.rejects(GamificationService.getRanking("t1", { periodo: "anio" }), (e) => e.status === 400);
    await assert.rejects(GamificationService.rankingDeCurso("c1", { role: "admin", tenantId: "t1" }, { periodo: "x" }), (e) => e.status === 400);
  });

  test("S11-12 · HU-057 · el ranking de un curso por mes suma solo el XP de sus actividades en el periodo", async () => {
    base();
    const admin = { id: "a", role: "admin", tenantId: "t1" };
    const r = await GamificationService.rankingDeCurso("c1", admin, { periodo: "mes", limite: 10 });
    assert.deepEqual(r.map((u) => [u.firstname, u.xp]), [["Beto", 60], ["Ana", 0], ["Caro", 0]]);
    const siempre = await GamificationService.rankingDeCurso("c1", admin, { limite: 10 });
    assert.deepEqual(siempre.map((u) => [u.firstname, u.xp]), [["Ana", 500], ["Beto", 60]]);
  });

  test("S11-13 · HU-057 · la semana empieza el lunes 00:00 y el mes el día 1 00:00 en hora de Colombia", () => {
    // Domingo 15/11/2026 22:00 en Colombia = lunes 16/11 03:00 UTC.
    const ahora = new Date("2026-11-16T03:00:00Z");
    assert.equal(inicioDePeriodo("semana", ahora), "2026-11-09T05:00:00.000Z");
    assert.equal(inicioDePeriodo("mes", ahora), "2026-11-01T05:00:00.000Z");
    // Lunes 16/11 00:30 en Colombia: ya es la semana nueva.
    assert.equal(inicioDePeriodo("semana", new Date("2026-11-16T05:30:00Z")), "2026-11-16T05:00:00.000Z");
    assert.equal(inicioDePeriodo("siempre"), null);
  });
});

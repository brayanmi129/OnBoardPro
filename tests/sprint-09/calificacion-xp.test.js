// Sprint 9 · Calificar la evaluación (HU-045) y tope y antiabuso de XP (HU-055).
const { preparar, estado } = require("../soporte/supabaseFalso.js");
const { aprendiz, escenario, respuestas } = require("../soporte/escenarioExamen.js");
const { test, describe, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const GamificationService = require("../../services/gamificationService.js");
const ReglasXpService = require("../../services/reglasXpService.js");
const ExamenService = require("../../services/examenService.js");
const { xpDelIntento } = ExamenService._reglas;

const ids = ["ex1-p1", "ex1-p2", "ex1-p3"];
const acreditarReal = GamificationService.acreditar;
let pedidos = [];
function simularAcreditar() {
  pedidos = [];
  GamificationService.acreditar = async (d) => {
    pedidos.push(d);
    return { xpGanado: d.puntos, xpBase: d.puntos, avisoXp: null, nivel: 1, subioDeNivel: false, logrosDesbloqueados: [] };
  };
}
const intentoFallido = { id: "i1", activity_id: "ex1", user_id: "u-ap", numero: 1, estado: "finalizado", aprobado: false, porcentaje: 0 };

describe("Calificar la evaluación y acreditar puntos", () => {
  beforeEach(simularAcreditar);

  test("S9-01 · HU-045 · la nota se calcula al instante al enviar", async () => {
    escenario();
    await ExamenService.iniciar("ex1", aprendiz);
    const r = await ExamenService.responder("ex1", aprendiz, { respuestas: respuestas(ids, 3) });
    assert.deepEqual([r.puntaje, r.puntajeTotal, r.porcentaje, r.aprobado], [3, 3, 100, true]);
  });

  test("S9-02 · HU-045 · los puntos se acreditan en proporción a la nota", async () => {
    escenario({ actividad: { porcentaje_aprobacion: 60 } });
    await ExamenService.iniciar("ex1", aprendiz);
    const r = await ExamenService.responder("ex1", aprendiz, { respuestas: respuestas(ids, 2) });
    assert.equal(r.porcentaje, 67);
    assert.equal(pedidos[0].puntos, 34); // 67% de 50
    assert.equal(r.xpBase, 34);
  });

  test("S9-03 · HU-045 · con 100% se acredita el XP completo; con 0 XP configurado, 0", () => {
    assert.equal(xpDelIntento({ xp: 50 }, { numero: 1, porcentaje: 100 }), 50);
    assert.equal(xpDelIntento({ xp: 0 }, { numero: 1, porcentaje: 100 }), 0);
  });

  test("S9-04 · HU-045 · el aprendiz ve qué acertó y qué falló si está habilitado", async () => {
    escenario();
    await ExamenService.iniciar("ex1", aprendiz);
    const r = await ExamenService.responder("ex1", aprendiz, { respuestas: respuestas(ids, 3) });
    assert.equal(r.mostrarRespuestas, true);
    assert.equal(r.detalle.length, 3);
    assert.ok(r.detalle.every((d) => d.correcta && d.opcionCorrecta));
  });

  test("S9-05 · HU-045 · si el instructor lo deshabilitó solo ve su nota", async () => {
    escenario({ actividad: { mostrar_respuestas: false } });
    await ExamenService.iniciar("ex1", aprendiz);
    const r = await ExamenService.responder("ex1", aprendiz, { respuestas: respuestas(ids, 3) });
    assert.equal(r.detalle, null);
    assert.equal(r.porcentaje, 100);
  });

  test("S9-06 · HU-045 · la respuesta correcta no se revela si reprobó y le quedan intentos", async () => {
    escenario();
    await ExamenService.iniciar("ex1", aprendiz);
    const r = await ExamenService.responder("ex1", aprendiz, { respuestas: respuestas(ids, 1) });
    assert.ok(r.detalle.every((d) => !("opcionCorrecta" in d)));
  });

  test("S9-07 · HU-045 · el resultado queda en el histórico del aprendiz", async () => {
    escenario();
    await ExamenService.iniciar("ex1", aprendiz);
    await ExamenService.responder("ex1", aprendiz, { respuestas: respuestas(ids, 1) });
    const h = await ExamenService.misIntentos("ex1", aprendiz);
    assert.equal(h.intentosUsados, 1);
    assert.equal(h.mejorPorcentaje, 33);
    assert.equal(h.intentos[0].estado, "finalizado");
  });

  test("S9-08 · HU-045 · mostrarRespuestas se configura y tiene que ser booleano", () => {
    assert.deepEqual(ExamenService._validarConfig({ mostrarRespuestas: false }, { type: "Examen" }), { mostrar_respuestas: false });
    assert.throws(() => ExamenService._validarConfig({ mostrarRespuestas: "si" }, { type: "Examen" }), (e) => e.status === 400);
  });
});

describe("Reglas de tope y antiabuso de XP", () => {
  test("S9-09 · HU-055 · aprobar en un reintento da la mitad del XP", () => {
    assert.equal(xpDelIntento({ xp: 50 }, { numero: 2, porcentaje: 80 }), 20);
    assert.equal(xpDelIntento({ xp: 50 }, { numero: 3, porcentaje: 100 }), 25);
  });

  test("S9-10 · HU-055 · al aprobar en un reintento se le avisa por qué suma menos", async () => {
    simularAcreditar();
    escenario({ intentos: [intentoFallido] });
    await ExamenService.iniciar("ex1", aprendiz);
    const r = await ExamenService.responder("ex1", aprendiz, { respuestas: respuestas(ids, 3) });
    assert.equal(pedidos[0].puntos, 25);
    assert.match(r.avisoXp, /reintento/);
  });

  describe("Tope diario", () => {
    beforeEach(() => {
      GamificationService.acreditar = acreditarReal;
      GamificationService.registrarDiaActivo = async () => null;
      GamificationService.recalcular = async () => ({ nivel: 1, subioDeNivel: false });
    });
    const acreditar = () =>
      GamificationService.acreditar({ userId: "u1", actividadId: "a1", tenantId: "t1", puntos: 50, motivo: "prueba" });

    test("S9-11 · HU-055 · si el tope recorta, se avisa cuánto sumó de cuánto", async () => {
      preparar({ rpc: () => ({ data: 20, error: null }) });
      const r = await acreditar();
      assert.equal(r.xpGanado, 20);
      assert.match(r.avisoXp, /sumaste 20 de 50 XP/);
    });

    test("S9-12 · HU-055 · con el tope alcanzado la actividad se completa con 0 XP y se avisa", async () => {
      preparar({ rpc: () => ({ data: 0, error: null }) });
      const r = await acreditar();
      assert.equal(r.xpGanado, 0);
      assert.match(r.avisoXp, /no sumó XP/);
    });

    test("S9-13 · HU-055 · sin recorte no hay aviso", async () => {
      preparar({ rpc: (fn, a) => ({ data: a.p_xp, error: null }) });
      assert.equal((await acreditar()).avisoXp, null);
    });
  });

  const admin = { role: "admin", tenantId: "t1" };

  test("S9-14 · HU-055 · el administrador define y quita el tope diario", async () => {
    preparar({ tablas: { tenants: [{ id: "t1", xp_tope_diario: null }] } });
    assert.equal((await ReglasXpService.guardar(admin, { topeDiario: 150 })).topeDiario, 150);
    assert.equal((await ReglasXpService.guardar(admin, { topeDiario: null })).topeDiario, null);
  });

  test("S9-15 · HU-055 · cero, negativos, decimales o texto responden 400", async () => {
    preparar({ tablas: { tenants: [{ id: "t1" }] } });
    for (const malo of [0, -5, 10.5, "mucho"]) {
      await assert.rejects(ReglasXpService.guardar(admin, { topeDiario: malo }), (e) => e.status === 400);
    }
  });

  test("S9-16 · HU-055 · el tope es de cada organización: un admin no cambia el de otra", async () => {
    preparar({ tablas: { tenants: [{ id: "t1", xp_tope_diario: null }, { id: "t2", xp_tope_diario: null }] } });
    await ReglasXpService.guardar(admin, { topeDiario: 99, tenantId: "t2" });
    assert.equal(estado.tablas.tenants.find((t) => t.id === "t2").xp_tope_diario, null);
    assert.equal(estado.tablas.tenants.find((t) => t.id === "t1").xp_tope_diario, 99);
  });

  test("S9-17 · HU-055 · lo ganado hoy cuenta solo XP de actividades de hoy", async () => {
    const { inicio } = ReglasXpService.hoyEnColombia();
    preparar({
      tablas: {
        tenants: [{ id: "t1", xp_tope_diario: 100 }],
        xp_movimientos: [
          { user_id: "u1", activity_id: "a1", xp: 30, created_at: inicio },
          { user_id: "u1", activity_id: null, xp: 500, created_at: inicio },
          { user_id: "u1", activity_id: "a0", xp: 40, created_at: "2020-01-01T00:00:00.000Z" },
        ],
      },
    });
    assert.deepEqual(await GamificationService.topeDeHoy("u1", "t1"), { tope: 100, ganadoHoy: 30, restante: 70 });
  });

  test("S9-18 · HU-055 · el día del tope empieza a medianoche de Colombia", () => {
    assert.ok(ReglasXpService.hoyEnColombia().inicio.endsWith("T05:00:00.000Z"));
  });
});

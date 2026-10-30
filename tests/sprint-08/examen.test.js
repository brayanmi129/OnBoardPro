// Sprint 8 · Presentar y responder una evaluación (HU-044).
const { estado } = require("../soporte/supabaseFalso.js");
const { aprendiz, escenario, respuestas } = require("../soporte/escenarioExamen.js");
const { test, describe, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const GamificationService = require("../../services/gamificationService.js");
const ExamenService = require("../../services/examenService.js");

// La acreditación de XP tiene sus propias pruebas: acá solo se registra el pedido.
let acreditados = [];
GamificationService.acreditar = async (d) => {
  acreditados.push(d);
  return { xpGanado: d.puntos, xpBase: d.puntos, avisoXp: null, nivel: 1, subioDeNivel: false, logrosDesbloqueados: [] };
};

const ids = ["ex1-p1", "ex1-p2", "ex1-p3"];

describe("Presentar y responder una evaluación", () => {
  beforeEach(() => { acreditados = []; });

  test("S8-16 · HU-044 · al iniciar se abre el intento 1 y el examen llega sin las respuestas", async () => {
    escenario();
    const r = await ExamenService.iniciar("ex1", aprendiz);
    assert.equal(r.intento.numero, 1);
    assert.equal(r.intentosRestantes, 2);
    assert.ok(r.examen.preguntas.every((p) => p.opciones.every((o) => !("esCorrecta" in o))));
  });

  test("S8-17 · HU-044 · si ya había un intento abierto se retoma en vez de gastar otro", async () => {
    escenario({ intentos: [{ id: "i1", activity_id: "ex1", user_id: "u-ap", numero: 1, estado: "en_curso", iniciado_at: new Date().toISOString() }] });
    const r = await ExamenService.iniciar("ex1", aprendiz);
    assert.equal(r.intento.id, "i1");
    assert.equal(estado.tablas.intentos_examen.length, 1);
  });

  test("S8-18 · HU-044 · sin intentos restantes no se puede iniciar otro", async () => {
    escenario({
      actividad: { intentos_permitidos: 1 },
      intentos: [{ id: "i1", activity_id: "ex1", user_id: "u-ap", numero: 1, estado: "finalizado", aprobado: false, porcentaje: 30 }],
    });
    await assert.rejects(ExamenService.iniciar("ex1", aprendiz), (e) => e.status === 409 && /único intento/.test(e.message));
  });

  test("S8-19 · HU-044 · un examen de un curso despublicado no se puede iniciar", async () => {
    escenario({ curso: { status: "Cerrado" } });
    await assert.rejects(ExamenService.iniciar("ex1", aprendiz), (e) => e.status === 409);
  });

  test("S8-20 · HU-044 · un examen sin preguntas no se puede iniciar", async () => {
    escenario({ n: 0 });
    await assert.rejects(ExamenService.iniciar("ex1", aprendiz), (e) => e.status === 409 && /preguntas/.test(e.message));
  });

  test("S8-21 · HU-044 · se corrige con la base: 3 de 3 aprueba con 100%", async () => {
    escenario();
    await ExamenService.iniciar("ex1", aprendiz);
    const r = await ExamenService.responder("ex1", aprendiz, { respuestas: respuestas(ids, 3) });
    assert.equal(r.aprobado, true);
    assert.equal(r.porcentaje, 100);
    assert.equal(acreditados.length, 1);
  });

  test("S8-22 · HU-044 · 1 de 3 (33%) no aprueba y no acredita XP", async () => {
    escenario();
    await ExamenService.iniciar("ex1", aprendiz);
    const r = await ExamenService.responder("ex1", aprendiz, { respuestas: respuestas(ids, 1) });
    assert.equal(r.aprobado, false);
    assert.equal(r.porcentaje, 33);
    assert.equal(r.intentosRestantes, 2);
    assert.equal(acreditados.length, 0);
  });

  test("S8-23 · HU-044 · una pregunta sin responder cuenta como incorrecta", async () => {
    escenario();
    await ExamenService.iniciar("ex1", aprendiz);
    const r = await ExamenService.responder("ex1", aprendiz, { respuestas: respuestas(ids.slice(0, 2), 2) });
    assert.equal(r.puntaje, 2);
    assert.equal(r.porcentaje, 67);
  });

  test("S8-24 · HU-044 · responder sin haber iniciado responde 409", async () => {
    escenario();
    await assert.rejects(ExamenService.responder("ex1", aprendiz, { respuestas: [] }), (e) => e.status === 409);
  });

  test("S8-25 · HU-044 · un intento ya enviado no se puede volver a enviar", async () => {
    escenario();
    await ExamenService.iniciar("ex1", aprendiz);
    await ExamenService.responder("ex1", aprendiz, { respuestas: respuestas(ids, 1) });
    await assert.rejects(ExamenService.responder("ex1", aprendiz, { respuestas: respuestas(ids, 3) }), (e) => e.status === 409);
  });

  test("S8-26 · HU-044 · responder preguntas de otro examen responde 400", async () => {
    escenario();
    await ExamenService.iniciar("ex1", aprendiz);
    await assert.rejects(
      ExamenService.responder("ex1", aprendiz, { respuestas: [{ preguntaId: "ajena", opcionId: "x" }] }),
      (e) => e.status === 400
    );
  });

  test("S8-27 · HU-044 · un intento con el tiempo vencido se cierra como no aprobado", async () => {
    const hace = new Date(Date.now() - 30 * 60000).toISOString();
    escenario({
      actividad: { tiempo_limite: 10 },
      intentos: [{ id: "i1", activity_id: "ex1", user_id: "u-ap", numero: 1, estado: "en_curso", iniciado_at: hace }],
    });
    await assert.rejects(ExamenService.responder("ex1", aprendiz, { respuestas: respuestas(ids, 3) }), (e) => /tiempo/.test(e.message));
    assert.equal(estado.tablas.intentos_examen[0].aprobado, false);
  });

  test("S8-28 · HU-044 · ya aprobado no se puede volver a rendir", async () => {
    escenario({ intentos: [{ id: "i1", activity_id: "ex1", user_id: "u-ap", numero: 1, estado: "finalizado", aprobado: true, porcentaje: 100 }] });
    estado.tablas.xp_movimientos.push({ user_id: "u-ap", activity_id: "ex1" });
    await assert.rejects(ExamenService.iniciar("ex1", aprendiz), (e) => e.status === 409 && /aprobaste/.test(e.message));
  });
});

// Sprint 9 · Crear actividad de concurso de preguntas (HU-065).
const { estado } = require("../soporte/supabaseFalso.js");
const { aprendiz, escenario, respuestas } = require("../soporte/escenarioExamen.js");
const { test, describe, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const GamificationService = require("../../services/gamificationService.js");
const ExamenService = require("../../services/examenService.js");
const ActivitieSchema = require("../../schemas/activitieSchema.js");
const { xpDeActividad } = require("../../helpers/niveles.js");
const { armarPartida, venceEn } = ExamenService._reglas;

let pedidos = [];
GamificationService.acreditar = async (d) => {
  pedidos.push(d);
  return { xpGanado: d.puntos, xpBase: d.puntos, avisoXp: null, logrosDesbloqueados: [] };
};
const admin = { id: "u-admin", role: "admin", tenantId: "t1", email: "admin@t1.com" };
const concurso = (extra = {}) => escenario({ actividad: { id: "cq1", type: "Concurso", xp: 30, ...extra }, n: 6 });

describe("Configurar el concurso", () => {
  test("S9-19 · HU-065 · Concurso es un tipo de actividad válido; un tipo inventado no", () => {
    const a = { id: "a1", name: "a1", title: "Quiz", type: "Concurso" };
    assert.equal(ActivitieSchema.schema.safeParse(a).success, true);
    assert.equal(ActivitieSchema.schema.safeParse({ ...a, type: "Juego" }).success, false);
  });

  test("S9-20 · HU-065 · se configuran cantidad de preguntas, tiempo por pregunta y dificultad creciente", () => {
    const c = ExamenService._validarConfig({ tiempoPorPregunta: 20, preguntasPorPartida: 5, dificultadCreciente: true }, { type: "Concurso" });
    assert.deepEqual(c, { tiempo_por_pregunta: 20, preguntas_por_partida: 5, dificultad_creciente: true });
  });

  test("S9-21 · HU-065 · valores fuera de rango y campos del tipo equivocado responden 400", () => {
    const f = (d, t) => assert.throws(() => ExamenService._validarConfig(d, { type: t }), (e) => e.status === 400);
    f({ tiempoPorPregunta: 3 }, "Concurso");
    f({ preguntasPorPartida: 0 }, "Concurso");
    f({ tiempoPorPregunta: 20 }, "Examen");
    f({ intentosPermitidos: 2 }, "Concurso");
  });

  test("S9-22 · HU-065 · cada pregunta tiene dificultad 1, 2 o 3", () => {
    const opciones = [{ texto: "a", esCorrecta: true }, { texto: "b", esCorrecta: false }];
    assert.equal(ExamenService._validarPregunta({ enunciado: "x", opciones, dificultad: 3 }).dificultad, 3);
    assert.throws(() => ExamenService._validarPregunta({ enunciado: "x", opciones, dificultad: 4 }), (e) => e.status === 400);
  });

  test("S9-23 · HU-065 · un concurso da 30 XP por defecto", () => {
    assert.equal(xpDeActividad({ type: "Concurso" }), 30);
  });

  test("S9-24 · HU-065 · un concurso no se marca como completado a mano", async () => {
    concurso();
    await assert.rejects(GamificationService.completarActividad("u-ap", "cq1", "t1"), (e) => e.status === 409 && /jugándolos/.test(e.message));
  });
});

describe("Armar las partidas", () => {
  const preguntas = Array.from({ length: 10 }, (_, i) => ({ id: `p${i}`, puntaje: 1, dificultad: (i % 3) + 1 }));

  test("S9-25 · HU-065 · se sortean tantas preguntas como pida la configuración, sin repetir", () => {
    const p = armarPartida(preguntas, { preguntas_por_partida: 4 });
    assert.equal(p.length, 4);
    assert.equal(new Set(p.map((x) => x.id)).size, 4);
  });

  test("S9-26 · HU-065 · con dificultad creciente salen de la más fácil a la más difícil", () => {
    for (let i = 0; i < 20; i++) {
      const d = armarPartida(preguntas, { dificultad_creciente: true }).map((p) => p.dificultad);
      assert.deepEqual(d, [...d].sort((a, b) => a - b));
    }
  });

  test("S9-27 · HU-065 · dos partidas no salen siempre en el mismo orden", () => {
    const ordenes = new Set(Array.from({ length: 20 }, () => armarPartida(preguntas, {}).map((p) => p.id).join()));
    assert.ok(ordenes.size > 1);
  });

  test("S9-28 · HU-065 · el tiempo de la partida es tiempo por pregunta × preguntas", () => {
    const v = venceEn({ iniciado_at: "2026-10-30T10:00:00.000Z", preguntas: ["a", "b", "c"] }, { type: "Concurso", tiempo_por_pregunta: 20 });
    assert.equal(v.toISOString(), "2026-10-30T10:01:00.000Z");
  });
});

describe("Previsualizar y jugar", () => {
  beforeEach(() => { pedidos = []; });

  test("S9-29 · HU-065 · la vista previa trae una partida con respuestas y puede regenerarse", async () => {
    concurso({ preguntas_por_partida: 3 });
    const a = await ExamenService.vistaPrevia("cq1", admin);
    assert.equal(a.preguntas.length, 3);
    assert.equal(a.preguntasDisponibles, 6);
    assert.ok(a.preguntas.every((p) => p.opciones.some((o) => o.esCorrecta === true)));
    const vistas = new Set();
    for (let i = 0; i < 15; i++) vistas.add((await ExamenService.vistaPrevia("cq1", admin)).preguntas.map((p) => p.id).join());
    assert.ok(vistas.size > 1);
    assert.equal(estado.tablas.intentos_examen.length, 0); // no abre intentos
  });

  test("S9-30 · HU-065 · la vista previa por partida es solo para concursos", async () => {
    escenario();
    await assert.rejects(ExamenService.vistaPrevia("ex1", admin), (e) => e.status === 409);
  });

  test("S9-31 · HU-065 · cada partida guarda las preguntas que le tocaron y solo trae esas", async () => {
    concurso({ preguntas_por_partida: 4 });
    const r = await ExamenService.iniciar("cq1", aprendiz);
    assert.equal(r.examen.preguntas.length, 4);
    assert.deepEqual(estado.tablas.intentos_examen[0].preguntas, r.examen.preguntas.map((p) => p.id));
    assert.equal(r.intentosRestantes, null); // partidas sin límite
  });

  test("S9-32 · HU-065 · aprobar la partida acredita el XP del concurso", async () => {
    concurso({ preguntas_por_partida: 3 });
    const r = await ExamenService.iniciar("cq1", aprendiz);
    const res = await ExamenService.responder("cq1", aprendiz, { respuestas: respuestas(r.examen.preguntas.map((p) => p.id), 3) });
    assert.equal(res.aprobado, true);
    assert.equal(pedidos[0].puntos, 30);
    assert.equal(pedidos[0].motivo, "concurso_aprobado");
  });

  test("S9-33 · HU-065 · se puede volver a jugar después de aprobar, pero ya no suma XP", async () => {
    concurso({ preguntas_por_partida: 3 });
    estado.tablas.intentos_examen.push({ id: "i0", activity_id: "cq1", user_id: "u-ap", numero: 1, estado: "finalizado", aprobado: true, porcentaje: 100, preguntas: [] });
    estado.tablas.xp_movimientos.push({ user_id: "u-ap", activity_id: "cq1" });
    const r = await ExamenService.iniciar("cq1", aprendiz);
    assert.match(r.message, /práctica/);
    const res = await ExamenService.responder("cq1", aprendiz, { respuestas: respuestas(r.examen.preguntas.map((p) => p.id), 3) });
    assert.equal(res.xpAcreditado, 0);
    assert.match(res.avisoXp, /no suma/);
    assert.equal(pedidos.length, 0);
  });
});

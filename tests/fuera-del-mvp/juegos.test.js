// Fuera del MVP · Jugar y ganar puntos (HU-067).
// Los concursos de preguntas quedaron fuera del alcance del MVP (6/11/2026).
// El motor sigue en el backend, así que sus pruebas se conservan acá, fuera de
// los sprints: npm run test:fuera-del-mvp
const { estado } = require("../soporte/supabaseFalso.js");
const { aprendiz, escenario, respuestas } = require("../soporte/escenarioExamen.js");
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const GamificationService = require("../../services/gamificationService.js");
const ExamenService = require("../../services/examenService.js");

describe("Jugar y ganar puntos", () => {
  let pedidos = [];
  const acreditarReal = GamificationService.acreditar;
  const simular = () => {
    pedidos = [];
    GamificationService.acreditar = async (d) => {
      pedidos.push(d);
      estado.tablas.xp_movimientos.push({ user_id: d.userId, activity_id: d.actividadId, xp: d.puntos });
      return { xpGanado: d.puntos, xpBase: d.puntos, avisoXp: null, logrosDesbloqueados: [] };
    };
  };
  const concurso = () => escenario({ actividad: { id: "cq1", type: "Concurso", xp: 40, porcentaje_aprobacion: 50 }, n: 4 });
  const jugar = async (bien) => {
    const r = await ExamenService.iniciar("cq1", aprendiz);
    return ExamenService.responder("cq1", aprendiz, { respuestas: respuestas(r.examen.preguntas.map((p) => p.id), bien) });
  };

  test("FM-16 · HU-067 · los puntos dependen del desempeño, no de participar", async () => {
    simular(); concurso();
    const r = await jugar(3); // 75%
    assert.equal(pedidos[0].puntos, 30);
    assert.equal(r.xpAcreditado, 30);
  });

  test("FM-17 · HU-067 · jugar sin aprobar no da puntos", async () => {
    simular(); concurso();
    const r = await jugar(1); // 25%
    assert.equal(r.aprobado, false);
    assert.equal(pedidos.length, 0);
  });

  test("FM-18 · HU-067 · al repetir el juego ya no se gana el puntaje", async () => {
    simular(); concurso();
    await jugar(4);
    const otra = await jugar(4);
    assert.equal(otra.xpAcreditado, 0);
    assert.equal(pedidos.length, 1);
  });

  test("FM-19 · HU-067 · el historial guarda el mejor resultado y cuántas partidas se jugaron", async () => {
    simular(); concurso();
    await jugar(1);
    await jugar(3);
    await jugar(2);
    const h = await ExamenService.misJuegos(aprendiz);
    assert.equal(h.juegos, 1);
    const [cq] = h.historial;
    assert.deepEqual([cq.partidas, cq.mejorPorcentaje, cq.aprobado], [3, 75, true]);
    assert.equal(cq.xpGanado, 15); // aprobó en la 2.ª partida: 75% de 40, a la mitad
    GamificationService.acreditar = acreditarReal;
  });

  test("FM-20 · HU-067 · sin partidas el historial está vacío", async () => {
    concurso();
    assert.deepEqual(await ExamenService.misJuegos(aprendiz), { juegos: 0, juegosAprobados: 0, xpGanado: 0, historial: [] });
  });
});

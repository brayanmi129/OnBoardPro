// Sprint 10 · Subir de nivel automáticamente (HU-054), desbloquear logros
// (HU-061), ver mis logros (HU-062) y jugar y ganar puntos (HU-067).
const { preparar, estado } = require("../soporte/supabaseFalso.js");
const { aprendiz, escenario, respuestas } = require("../soporte/escenarioExamen.js");
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const GamificationService = require("../../services/gamificationService.js");
const DesbloqueoService = require("../../services/desbloqueoService.js");
const ExamenService = require("../../services/examenService.js");

const admin = { id: "a1", role: "admin", tenantId: "t1", email: "admin@t1.com" };

describe("Subir de nivel automáticamente", () => {
  const conXp = (xp, nivelGuardado, tabla = []) => {
    const llamadas = [];
    preparar({
      tablas: { users: [{ id: "u1", tenant_id: "t1" }], niveles: tabla },
      rpc: (fn, a) => {
        llamadas.push({ fn, ...a });
        if (fn === "recalcular_xp") return { data: xp, error: null };
        if (fn === "subir_nivel") {
          const despues = Math.max(nivelGuardado, a.p_nivel); // lo que hace la base
          return { data: [{ antes: nivelGuardado, despues }], error: null };
        }
        return { data: null, error: null };
      },
    });
    return llamadas;
  };

  test("S10-16 · HU-054 · al cruzar un umbral el nivel sube en la misma operación y se avisa", async () => {
    const llamadas = conXp(260, 1);
    const r = await GamificationService.recalcular("u1");
    assert.deepEqual(llamadas.map((l) => l.fn), ["recalcular_xp", "subir_nivel"]);
    assert.equal(llamadas[1].p_nivel, 2);
    assert.equal(r.nivel, 2);
    assert.equal(r.subioDeNivel, true);
  });

  test("S10-17 · HU-054 · si el XP no cruza un umbral no hay aviso de subida", async () => {
    conXp(120, 1);
    const r = await GamificationService.recalcular("u1");
    assert.equal(r.subioDeNivel, false);
  });

  test("S10-18 · HU-054 · el nivel nunca baja al acreditar, aunque el XP quede por debajo", async () => {
    conXp(50, 3);
    const r = await GamificationService.recalcular("u1");
    assert.equal(r.nivel, 3);
    assert.equal(r.subioDeNivel, false);
  });

  test("S10-19 · HU-054 · el umbral sale de la tabla de niveles de la organización", async () => {
    const llamadas = conXp(130, 0, [
      { tenant_id: "t1", numero: 1, xp_minimo: 50, nombre: "Novato" },
      { tenant_id: "t1", numero: 2, xp_minimo: 120, nombre: "Aprendiz" },
    ]);
    const r = await GamificationService.recalcular("u1");
    assert.equal(llamadas[1].p_nivel, 2);
    assert.equal(r.nombreNivel, "Aprendiz");
  });
});

// Una organización con tres aprendices y logros de distinto tipo.
function conLogros({ ganados = [] } = {}) {
  preparar({
    tablas: {
      users: [
        { id: "u1", firstname: "Ana", role: "student", tenant_id: "t1", xp: 300, level: 2, streak: 4, racha_maxima: 4 },
        { id: "u2", firstname: "Beto", role: "student", tenant_id: "t1", xp: 200, level: 1, streak: 0, racha_maxima: 1 },
        { id: "u3", firstname: "Caro", role: "student", tenant_id: "t1", xp: 0, level: 0, streak: 0, racha_maxima: 0 },
      ],
      logros: [
        { id: "l-racha", tenant_id: "t1", nombre: "Constante", categoria: "Constancia", tipo_condicion: "racha_dias", meta: 3, xp_recompensa: 0, activo: true },
        { id: "l-top2", tenant_id: "t1", nombre: "Top 2", categoria: "Ranking", tipo_condicion: "posicion_ranking", meta: 2, xp_recompensa: 0, activo: true },
        { id: "l-nivel", tenant_id: "t1", nombre: "Nivel 5", categoria: "Nivel", tipo_condicion: "nivel_alcanzado", meta: 5, xp_recompensa: 0, activo: true },
      ],
      logros_usuario: ganados,
      xp_movimientos: [], entregas: [], intentos_examen: [], users_groups: [],
    },
    // otorgar_logro: lo inserta si no lo tenía, como la función de la base.
    rpc: (fn, a) => {
      if (fn !== "otorgar_logro") return { data: null, error: null };
      const ya = estado.tablas.logros_usuario.some((g) => g.logro_id === a.p_logro && g.user_id === a.p_user);
      if (ya) return { data: false, error: null };
      estado.tablas.logros_usuario.push({ logro_id: a.p_logro, user_id: a.p_user, desbloqueado_at: new Date().toISOString(), xp_otorgado: 0 });
      return { data: true, error: null };
    },
  });
}

describe("Desbloquear logro automáticamente", () => {
  test("S10-20 · HU-061 · al ganar XP se otorga el logro que ya se cumple", async () => {
    conLogros();
    const r = await DesbloqueoService.evaluar("u1");
    assert.deepEqual(r.logros.map((l) => l.id), ["l-racha"]);
  });

  test("S10-21 · HU-061 · las medallas de ranking no se dan en tiempo real", async () => {
    conLogros();
    const r = await DesbloqueoService.evaluar("u1"); // Ana va primera
    assert.ok(!r.logros.some((l) => l.id === "l-top2"));
  });

  test("S10-22 · HU-061 · al cierre del periodo se otorgan las de ranking a quien está en el puesto", async () => {
    conLogros();
    const r = await DesbloqueoService.cerrarPeriodoRanking(admin);
    assert.deepEqual(r.otorgados.map((o) => o.persona.firstname), ["Ana", "Beto"]);
    assert.ok(r.otorgados.every((o) => o.logro.id === "l-top2"));
  });

  test("S10-23 · HU-061 · con 0 XP no se gana una medalla de ranking", async () => {
    conLogros();
    const r = await DesbloqueoService.cerrarPeriodoRanking({ ...admin });
    assert.ok(!r.otorgados.some((o) => o.persona.firstname === "Caro"));
  });

  test("S10-24 · HU-061 · una medalla se otorga una sola vez: cerrar dos veces no la duplica", async () => {
    conLogros();
    await DesbloqueoService.cerrarPeriodoRanking(admin);
    const segunda = await DesbloqueoService.cerrarPeriodoRanking(admin);
    assert.equal(segunda.otorgados.length, 0);
    assert.equal(estado.tablas.logros_usuario.filter((g) => g.logro_id === "l-top2").length, 2);
  });

  test("S10-25 · HU-061 · el superadmin tiene que indicar la organización del cierre", async () => {
    conLogros();
    await assert.rejects(DesbloqueoService.cerrarPeriodoRanking({ role: "superadmin" }), (e) => e.status === 400);
  });
});

describe("Ver mis logros", () => {
  test("S10-26 · HU-062 · los ganados muestran la fecha en que se obtuvieron", async () => {
    conLogros({ ganados: [{ logro_id: "l-racha", user_id: "u1", desbloqueado_at: "2026-11-01T10:00:00Z", xp_otorgado: 0 }] });
    const r = await DesbloqueoService.mios("u1");
    const racha = r.logros.find((l) => l.id === "l-racha");
    assert.equal(racha.desbloqueado, true);
    assert.equal(racha.desbloqueadoAt, "2026-11-01T10:00:00Z");
  });

  test("S10-27 · HU-062 · los pendientes muestran la condición y el avance", async () => {
    conLogros();
    const r = await DesbloqueoService.mios("u1");
    const nivel = r.logros.find((l) => l.id === "l-nivel");
    assert.equal(nivel.desbloqueado, false);
    assert.equal(nivel.condicion.descripcion, "Alcanzar el nivel 5");
    assert.deepEqual(nivel.progreso, { actual: 2, meta: 5, porcentaje: 40 });
  });

  test("S10-28 · HU-062 · consultar mis logros no otorga nada", async () => {
    conLogros();
    await DesbloqueoService.mios("u1");
    assert.equal(estado.tablas.logros_usuario.length, 0);
  });
});

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

  test("S10-29 · HU-067 · los puntos dependen del desempeño, no de participar", async () => {
    simular(); concurso();
    const r = await jugar(3); // 75%
    assert.equal(pedidos[0].puntos, 30);
    assert.equal(r.xpAcreditado, 30);
  });

  test("S10-30 · HU-067 · jugar sin aprobar no da puntos", async () => {
    simular(); concurso();
    const r = await jugar(1); // 25%
    assert.equal(r.aprobado, false);
    assert.equal(pedidos.length, 0);
  });

  test("S10-31 · HU-067 · al repetir el juego ya no se gana el puntaje", async () => {
    simular(); concurso();
    await jugar(4);
    const otra = await jugar(4);
    assert.equal(otra.xpAcreditado, 0);
    assert.equal(pedidos.length, 1);
  });

  test("S10-32 · HU-067 · el historial guarda el mejor resultado y cuántas partidas se jugaron", async () => {
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

  test("S10-33 · HU-067 · sin partidas el historial está vacío", async () => {
    concurso();
    assert.deepEqual(await ExamenService.misJuegos(aprendiz), { juegos: 0, juegosAprobados: 0, xpGanado: 0, historial: [] });
  });
});

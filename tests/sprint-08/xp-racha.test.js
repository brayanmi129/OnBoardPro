// Sprint 8 · Acreditar XP al completar (HU-052) y racha de días activos (HU-058).
const { preparar, estado } = require("../soporte/supabaseFalso.js");
const { test, describe, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const { umbral, nivelPara, progreso, xpDeActividad, NIVEL_MAXIMO } = require("../../helpers/niveles.js");
const { siguienteRacha, diasEntre, hoy } = require("../../helpers/racha.js");
const GamificationService = require("../../services/gamificationService.js");

const acreditar = (puntos) =>
  GamificationService.acreditar({ userId: "u1", actividadId: "a1", tenantId: "t1", puntos, motivo: "prueba" });

describe("Acreditar XP al completar", () => {
  const registrarDiaActivo = GamificationService.registrarDiaActivo;
  const recalcular = GamificationService.recalcular;
  beforeEach(() => {
    preparar({ rpc: (fn, a) => ({ data: a.p_xp, error: null }) });
    // La racha y el recálculo se prueban aparte.
    GamificationService.registrarDiaActivo = async () => ({ dias: 1, maxima: 1, crecioHoy: true });
    GamificationService.recalcular = async () => ({ nivel: 1, subioDeNivel: false });
  });

  test("S8-29 · HU-052 · completar una actividad acredita su XP", async () => {
    const r = await acreditar(50);
    assert.equal(r.xpGanado, 50);
  });

  test("S8-30 · HU-052 · una actividad paga una sola vez: el segundo cobro responde 409", async () => {
    preparar({ rpc: () => ({ data: null, error: { code: "23505", message: "duplicate key" } }) });
    await assert.rejects(acreditar(50), (e) => e.status === 409);
  });

  test("S8-31 · HU-052 · un XP negativo se acredita como 0", async () => {
    let pedido;
    preparar({ rpc: (fn, a) => { pedido = a.p_xp; return { data: a.p_xp, error: null }; } });
    await acreditar(-10);
    assert.equal(pedido, 0);
  });

  test("S8-32 · HU-052 · si la base no tiene la función nueva, se acredita igual", async () => {
    preparar({ rpc: () => ({ data: null, error: { code: "PGRST202", message: "Could not find the function" } }) });
    const r = await acreditar(30);
    assert.equal(r.xpGanado, 30);
    assert.equal(estado.tablas.xp_movimientos[0].xp, 30);
  });

  test("S8-33 · HU-052 · solo los recursos se marcan a mano; tareas y exámenes no", async () => {
    GamificationService.registrarDiaActivo = registrarDiaActivo;
    GamificationService.recalcular = recalcular;
    preparar({ tablas: { activities: [{ id: "t1a", type: "Tarea", xp: 30, tenant_id: "t1" }, { id: "e1", type: "Examen", xp: 50, tenant_id: "t1" }] } });
    await assert.rejects(GamificationService.completarActividad("u1", "t1a", "t1"), (e) => e.status === 409 && /entregando/.test(e.message));
    await assert.rejects(GamificationService.completarActividad("u1", "e1", "t1"), (e) => e.status === 409 && /resolviéndolos/.test(e.message));
  });

  test("S8-34 · HU-052 · cada tipo de actividad tiene su XP por defecto", () => {
    assert.equal(xpDeActividad({ type: "Recurso" }), 10);
    assert.equal(xpDeActividad({ type: "Tarea" }), 30);
    assert.equal(xpDeActividad({ type: "Examen" }), 50);
    assert.equal(xpDeActividad({ type: "Examen", xp: 80 }), 80);
  });

  test("S8-35 · HU-052 · los niveles siguen la curva 25·n·(n+3)", () => {
    assert.deepEqual([1, 2, 3, 4, 5].map(umbral), [100, 250, 450, 700, 1000]);
  });

  test("S8-36 · HU-052 · el nivel sube justo al cruzar el umbral", () => {
    assert.equal(nivelPara(99), 0);
    assert.equal(nivelPara(100), 1);
    assert.equal(nivelPara(250), 2);
  });

  test("S8-37 · HU-052 · XP inválido cuenta como 0 y uno enorme no pasa del nivel máximo", () => {
    assert.equal(nivelPara(-5), 0);
    assert.equal(nivelPara("abc"), 0);
    assert.equal(nivelPara(10 ** 9), NIVEL_MAXIMO);
  });

  test("S8-38 · HU-052 · la barra dice cuánto falta para el siguiente nivel", () => {
    const p = progreso(175);
    assert.deepEqual([p.nivel, p.xpSiguienteNivel, p.faltan, p.porcentaje], [1, 250, 75, 50]);
  });
});

describe("Racha de días activos", () => {
  test("S8-39 · HU-058 · sin actividad previa la racha arranca en 1", () => {
    const r = siguienteRacha({ ultimaActividad: null }, "2026-10-30");
    assert.deepEqual(r, { racha: 1, rachaMaxima: 1, ultimaActividad: "2026-10-30", cambio: true });
  });

  test("S8-40 · HU-058 · actividad ayer suma un día", () => {
    const r = siguienteRacha({ ultimaActividad: "2026-10-29", racha: 4, rachaMaxima: 4 }, "2026-10-30");
    assert.equal(r.racha, 5);
    assert.equal(r.rachaMaxima, 5);
  });

  test("S8-41 · HU-058 · dos actividades el mismo día no suman dos veces", () => {
    const r = siguienteRacha({ ultimaActividad: "2026-10-30", racha: 3, rachaMaxima: 7 }, "2026-10-30");
    assert.equal(r.racha, 3);
    assert.equal(r.cambio, false);
  });

  test("S8-42 · HU-058 · saltear un día corta la racha pero conserva la máxima", () => {
    const r = siguienteRacha({ ultimaActividad: "2026-10-27", racha: 6, rachaMaxima: 6 }, "2026-10-30");
    assert.equal(r.racha, 1);
    assert.equal(r.rachaMaxima, 6);
  });

  test("S8-43 · HU-058 · una fecha futura no regala ni corta la racha", () => {
    const r = siguienteRacha({ ultimaActividad: "2026-11-05", racha: 2, rachaMaxima: 2 }, "2026-10-30");
    assert.equal(r.racha, 2);
    assert.equal(r.cambio, false);
  });

  test("S8-44 · HU-058 · los días se cuentan por calendario, también entre meses", () => {
    assert.equal(diasEntre("2026-10-31", "2026-11-01"), 1);
  });

  test("S8-45 · HU-058 · el día se calcula en hora de Colombia y no en UTC", () => {
    assert.equal(hoy(new Date("2026-10-30T02:00:00Z")), "2026-10-29");
    assert.equal(hoy(new Date("2026-10-30T06:00:00Z")), "2026-10-30");
  });

  test("S8-46 · HU-058 · una racha vencida se muestra en 0 aunque la base diga otra cosa", async () => {
    preparar({
      tablas: {
        users: [{ id: "u1", xp: 0, level: 0, streak: 5, racha_maxima: 5, ultima_actividad: "2026-01-01", tenant_id: null }],
        xp_movimientos: [],
      },
    });
    const p = await GamificationService.miProgreso("u1");
    assert.equal(p.racha.dias, 0);
    assert.equal(p.racha.maxima, 5);
  });
});

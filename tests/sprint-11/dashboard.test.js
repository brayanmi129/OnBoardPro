// Sprint 11 · Reporte de uso de la organización y de la plataforma (HU-078).
const { preparar } = require("../soporte/supabaseFalso.js");
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const DashboardService = require("../../services/dashboardService.js");

const hace = (dias) => new Date(Date.now() - dias * 86400000).toISOString();
const admin = { id: "adm", role: "admin", tenantId: "t1" };
const sa = { id: "sa", role: "superadmin", tenantId: null };

// t1: dos aprendices con un curso publicado de 2 actividades. Ana lo terminó
// (una actividad hace 40 días, otra hace 2); Beto no hizo nada.
// t2: otra organización con un aprendiz que ganó XP hace 1 día.
const tablasBase = () => ({
    tenants: [{ id: "t1", name: "Acme", active: true, created_at: "2026-08-01T00:00:00Z" }, { id: "t2", name: "Otra", active: false, created_at: "2026-09-01T00:00:00Z" }],
    groups: [{ id: "g1", tenant_id: "t1" }, { id: "g2", tenant_id: "t1" }, { id: "gz", tenant_id: "t2" }],
    users: [
      { id: "u1", firstname: "Ana", lastname: "Ruiz", role: "student", status: "Active", tenant_id: "t1", xp: 100, ultima_actividad: "2026-11-14" },
      { id: "u2", firstname: "Beto", lastname: "Paz", role: "student", status: "Active", tenant_id: "t1", xp: 0, ultima_actividad: null },
      { id: "i1", firstname: "Ines", role: "instructor", status: "Active", tenant_id: "t1", xp: 0 },
      { id: "adm", firstname: "Ada", role: "admin", status: "Active", tenant_id: "t1", xp: 0 },
      { id: "sa", firstname: "Super", role: "superadmin", status: "Active", tenant_id: null, xp: 0 },
      { id: "z1", firstname: "Zoe", role: "student", status: "Active", tenant_id: "t2", xp: 70, ultima_actividad: "2026-11-15" },
    ],
    courses: [
      { id: "c1", name: "Inducción", tenant_id: "t1", status: "Abierto", archivado: false },
      { id: "c2", name: "Borrador", tenant_id: "t1", status: "Cerrado", archivado: false },
      { id: "c3", name: "Viejo", tenant_id: "t1", status: "Abierto", archivado: true },
      { id: "cz", name: "Ajeno", tenant_id: "t2", status: "Abierto", archivado: false },
    ],
    sections: [{ id: "s1", course_id: "c1" }, { id: "sz", course_id: "cz" }],
    activities: [{ id: "a1", section_id: "s1" }, { id: "a2", section_id: "s1" }, { id: "az", section_id: "sz" }],
    groups_courses: [{ id: 1, id_group: "g1", id_course: "c1" }, { id: 2, id_group: "gz", id_course: "cz" }],
    users_groups: [{ id: 1, id_user: "u1", id_group: "g1" }, { id: 2, id_user: "u2", id_group: "g1" }, { id: 3, id_user: "z1", id_group: "gz" }],
    entregas: [
      { id: "e1", tenant_id: "t1", estado: "entregado" },
      { id: "e2", tenant_id: "t1", estado: "aprobada" },
      { id: "e3", tenant_id: "t2", estado: "entregado" },
    ],
    xp_movimientos: [
      { id: "m1", user_id: "u1", activity_id: "a1", xp: 50, created_at: hace(40) },
      { id: "m2", user_id: "u1", activity_id: "a2", xp: 50, created_at: hace(2) },
      { id: "m3", user_id: "z1", activity_id: "az", xp: 70, created_at: hace(1) },
    ],
});
const base = () => preparar({ tablas: tablasBase() });

describe("Tablero de administración", () => {
  test("S11-21 · HU-078 · el admin ve solo su organización: usuarios, cursos, XP y entregas por revisar", async () => {
    base();
    const r = await DashboardService.de(admin, { dias: 30 });
    assert.equal(r.alcance, "organizacion");
    assert.deepEqual(r.organizacion, { id: "t1", nombre: "Acme" });
    assert.deepEqual(r.usuarios, { total: 4, porRol: { student: 2, instructor: 1, admin: 1 }, activosPeriodo: 1, activosPeriodoAnterior: 1 });
    assert.deepEqual(r.cursos, { total: 2, publicados: 1 });
    assert.deepEqual(r.xp, { otorgadoPeriodo: 50, otorgadoPeriodoAnterior: 50 });
    assert.equal(r.entregasPorRevisar, 1);
    assert.equal(r.xpPromedio, 50);
  });

  test("S11-22 · HU-078 · la tasa de finalización compara contra el inicio del periodo", async () => {
    base();
    const r = await DashboardService.de(admin, { dias: 30 });
    // 4 actividades asignadas (2 aprendices x 2); hoy hay 2 hechas, al inicio del periodo 1.
    assert.deepEqual(r.tasaFinalizacion, { actual: 50, anterior: 25 });
    assert.deepEqual(r.cursosDetalle, [{ id: "c1", nombre: "Inducción", aprendices: 2, avancePromedio: 50, completaron: 1 }]);
  });

  test("S11-23 · HU-078 · lista a los aprendices sin actividad en 7 días y arma un punto por día", async () => {
    base();
    const r = await DashboardService.de(admin, { dias: 7 });
    assert.deepEqual(r.aprendicesSinActividad, [{ id: "u2", nombre: "Beto", apellido: "Paz", ultimaActividad: null }]);
    assert.equal(r.actividadPorDia.length, 7);
    assert.equal(r.actividadPorDia.reduce((a, d) => a + d.xp, 0), 50);
    assert.equal(r.actividadPorDia.reduce((a, d) => a + d.completadas, 0), 1);
    assert.match(r.actividadPorDia[0].fecha, /^\d{4}-\d{2}-\d{2}$/);
  });

  test("S11-33 · HU-078 · la serie diaria cuenta personas distintas activas, entregas y actividades creadas", async () => {
    base();
    const r0 = await DashboardService.de(admin, { dias: 7 });
    assert.equal(r0.accesosRegistrados, true);
    const ayer = r0.actividadPorDia.at(-2).fecha;
    const hoyF = r0.actividadPorDia.at(-1).fecha;
    preparar({
      tablas: {
        ...tablasBase(),
        accesos_diarios: [
          { user_id: "u2", dia: ayer },
          { user_id: "i1", dia: ayer },
          { user_id: "z1", dia: ayer },
        ],
        entregas: [{ id: "e9", tenant_id: "t1", user_id: "u1", estado: "entregado", entregado_at: hace(1) }],
        activities: [...tablasBase().activities, { id: "a9", section_id: "s1", created_at: hace(0) }],
      },
    });
    const r = await DashboardService.de(admin, { dias: 7 });
    const dia = (f) => r.actividadPorDia.find((d) => d.fecha === f);
    // Ayer: Beto e Ines entraron, Ana envió una entrega; Zoe es de otra organización.
    assert.equal(dia(ayer).activos, 3);
    assert.equal(dia(ayer).entregas, 1);
    assert.equal(dia(hoyF).creadas, 1);
    // Ana ganó XP hace 2 días: cuenta como activa ese día.
    assert.equal(r.actividadPorDia.at(-3).activos, 1);
  });

  test("S11-24 · HU-078 · el admin no puede pedir otra organización: el tenantId se ignora", async () => {
    base();
    const r = await DashboardService.de(admin, { tenantId: "t2" });
    assert.equal(r.organizacion.id, "t1");
    assert.equal(r.xp.otorgadoPeriodo, 50);
  });

  test("S11-25 · HU-078 · el superadmin sin tenantId ve la plataforma con el uso de cada organización", async () => {
    base();
    const r = await DashboardService.de(sa, {});
    assert.equal(r.alcance, "plataforma");
    assert.equal(r.periodo.dias, 30);
    assert.deepEqual(r.organizaciones, { total: 2, activas: 1 });
    assert.equal(r.usuarios.total, 5, "los superadmins no cuentan");
    assert.equal(r.xp.otorgadoPeriodo, 120);
    assert.equal(r.actividadesCompletadasPeriodo, 2);
    const otra = r.porOrganizacion.find((o) => o.id === "t2");
    assert.deepEqual(otra, {
      id: "t2", nombre: "Otra", activa: false, creada: "2026-09-01T00:00:00Z",
      usuarios: 1, aprendices: 1, instructores: 0, admins: 0, aprendicesActivos: 1,
      cursosPublicados: 1, cursosCreados: 1, grupos: 1, entregasPorRevisar: 1,
      tasaFinalizacion: 100, ultimaActividad: "2026-11-15", xpPeriodo: 70,
    });
    const acme = r.porOrganizacion.find((o) => o.id === "t1");
    assert.equal(acme.aprendices, 2);
    assert.equal(acme.instructores, 1);
    assert.equal(acme.admins, 1);
    assert.equal(acme.cursosCreados, 2, "el archivado no cuenta");
    assert.equal(acme.grupos, 2);
    assert.equal(acme.entregasPorRevisar, 1, "solo las que están en estado entregado");
    assert.equal(acme.ultimaActividad, "2026-11-14");
  });

  test("S11-26 · HU-078 · superadmin con tenantId ve esa organización; dias fuera de 7..90 o tenant inexistente fallan", async () => {
    base();
    const r = await DashboardService.de(sa, { tenantId: "t2" });
    assert.equal(r.alcance, "organizacion");
    assert.equal(r.usuarios.total, 1);
    await assert.rejects(DashboardService.de(admin, { dias: 3 }), (e) => e.status === 400);
    await assert.rejects(DashboardService.de(admin, { dias: "abc" }), (e) => e.status === 400);
    await assert.rejects(DashboardService.de(sa, { tenantId: "t9" }), (e) => e.status === 404);
  });
});

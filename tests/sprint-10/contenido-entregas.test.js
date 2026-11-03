// Sprint 10 · Consultar actividades (HU-035), ver y descargar material
// (HU-038) y consultar entregas pendientes (HU-047).
const { preparar } = require("../soporte/supabaseFalso.js");
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const SectionService = require("../../services/sectionService.js");
const MaterialService = require("../../services/materialService.js");
const EntregaService = require("../../services/entregaService.js");
const ActivitiesController = require("../../controllers/activitiesController.js");

const aprendiz = { id: "u1", role: "student", tenantId: "t1", email: "ana@t1.com" };
const ajeno = { id: "u9", role: "student", tenantId: "t1", email: "beto@t1.com" };
const instructor = { id: "i1", role: "instructor", tenantId: "t1", email: "inst@t1.com" };
const admin = { id: "a1", role: "admin", tenantId: "t1", email: "admin@t1.com" };

const base = (extra = {}) => preparar({
  tablas: {
    courses: [
      { id: "c1", tenant_id: "t1", name: "Inducción", status: "Abierto", archivado: false, instructor: "inst@t1.com" },
      { id: "c2", tenant_id: "t1", name: "Ventas", status: "Abierto", archivado: false, instructor: "otro@t1.com" },
      { id: "c3", tenant_id: "t1", name: "Borrador", status: "Cerrado", archivado: false, instructor: "inst@t1.com" },
    ],
    sections: [
      { id: "s2", course_id: "c1", name: "Segunda", orden: 1 },
      { id: "s1", course_id: "c1", name: "Primera", orden: 0 },
      { id: "s3", course_id: "c2", name: "Única", orden: 0 },
      { id: "s4", course_id: "c3", name: "Única", orden: 0 },
    ],
    activities: [
      { id: "rec", section_id: "s1", tenant_id: "t1", title: "Manual", type: "Recurso", orden: 0 },
      { id: "tar", section_id: "s1", tenant_id: "t1", title: "Informe", type: "Tarea", orden: 1 },
      { id: "tar2", section_id: "s2", tenant_id: "t1", title: "Presentación", type: "Tarea", orden: 0 },
      { id: "ex", section_id: "s2", tenant_id: "t1", title: "Examen", type: "Examen", orden: 1 },
      { id: "ven", section_id: "s3", tenant_id: "t1", title: "Guía de ventas", type: "Tarea", orden: 0 },
      { id: "bor", section_id: "s4", tenant_id: "t1", title: "En borrador", type: "Recurso", orden: 0 },
    ],
    users_groups: [{ id_user: "u1", id_group: "g1" }],
    groups_courses: [{ id_group: "g1", id_course: "c1" }, { id_group: "g1", id_course: "c3" }],
    xp_movimientos: [{ user_id: "u1", activity_id: "rec" }],
    entregas: [
      { id: "e1", activity_id: "tar", user_id: "u1", estado: "entregado", entregado_at: "2026-11-02T10:00:00Z" },
      { id: "e2", activity_id: "tar2", user_id: "u1", estado: "rehacer", entregado_at: "2026-11-01T09:00:00Z" },
      { id: "e3", activity_id: "tar", user_id: "u2", estado: "entregado", entregado_at: "2026-10-30T08:00:00Z" },
      { id: "e4", activity_id: "tar2", user_id: "u2", estado: "aprobada", entregado_at: "2026-10-29T08:00:00Z" },
      { id: "e5", activity_id: "ven", user_id: "u3", estado: "entregado", entregado_at: "2026-10-28T08:00:00Z" },
    ],
    materiales: [
      { id: "m1", activity_id: "rec", nombre: "Manual.pdf", ruta: "t1/a.pdf", mime: "application/pdf", orden: 0 },
      { id: "m2", activity_id: "rec", nombre: "Bienvenida.mp4", ruta: "t1/b.mp4", mime: "video/mp4", orden: 1 },
      { id: "m3", activity_id: "rec", nombre: "Charla (YouTube)", ruta: "https://youtu.be/x", mime: "text/html", orden: 2 },
      { id: "m4", activity_id: "rec", nombre: "Planilla.xlsx", ruta: "t1/c.xlsx", mime: "application/vnd.ms-excel", orden: 3 },
      { id: "m5", activity_id: "bor", nombre: "x.pdf", ruta: "t1/x.pdf", mime: "application/pdf", orden: 0 },
    ],
    users: [
      { id: "u1", firstname: "Ana", lastname: "Gil", email: "ana@t1.com" },
      { id: "u2", firstname: "Beto", lastname: "Paz", email: "beto@t1.com" },
      { id: "u3", firstname: "Caro", lastname: "Ríos", email: "caro@t1.com" },
    ],
    ...extra,
  },
});

describe("Consultar actividades de un curso", () => {
  test("S10-01 · HU-035 · las actividades vienen agrupadas por sección y en orden", async () => {
    base();
    const secciones = await SectionService.listar("c1", "t1", { soloConContenido: true, aprendizId: "u1" });
    assert.deepEqual(secciones.map((s) => s.name), ["Primera", "Segunda"]);
    assert.deepEqual(secciones.map((s) => s.actividades.map((a) => a.id)), [["rec", "tar"], ["tar2", "ex"]]);
  });

  test("S10-02 · HU-035 · cada actividad dice si está pendiente, entregada o completada", async () => {
    base();
    const [primera, segunda] = await SectionService.listar("c1", "t1", { soloConContenido: true, aprendizId: "u1" });
    const estado = Object.fromEntries([...primera.actividades, ...segunda.actividades].map((a) => [a.id, a.estado]));
    assert.deepEqual(estado, { rec: "completada", tar: "entregada", tar2: "pendiente", ex: "pendiente" });
  });

  test("S10-03 · HU-035 · una entrega devuelta para rehacer cuenta como pendiente y conserva su estado", async () => {
    base();
    const [, segunda] = await SectionService.listar("c1", "t1", { soloConContenido: true, aprendizId: "u1" });
    const tar2 = segunda.actividades.find((a) => a.id === "tar2");
    assert.equal(tar2.estado, "pendiente");
    assert.equal(tar2.entrega, "rehacer");
  });

  test("S10-04 · HU-035 · el aprendiz no ve las actividades de un curso que no tiene asignado", async () => {
    base();
    await assert.rejects(
      SectionService.listar("c2", "t1", { soloConContenido: true, aprendizId: "u1" }),
      (e) => e.status === 404
    );
  });

  test("S10-05 · HU-035 · quien arma el curso ve todo, sin el filtro de asignación", async () => {
    base();
    const secciones = await SectionService.listar("c2", "t1");
    assert.equal(secciones[0].actividades[0].id, "ven");
  });
});

describe("Ver y descargar material", () => {
  test("S10-06 · HU-038 · cada material dice qué tipo es y si se puede ver sin salir de la plataforma", async () => {
    base();
    const lista = await MaterialService.listar("rec", aprendiz);
    const tipos = Object.fromEntries(lista.map((m) => [m.id, [m.tipo, m.previsualizable]]));
    assert.deepEqual(tipos, {
      m1: ["pdf", true], m2: ["video", true], m3: ["enlace", false], m4: ["archivo", false],
    });
    assert.ok(lista.every((m) => m.url), "cada material trae su enlace");
  });

  test("S10-07 · HU-038 · un aprendiz sin el curso asignado no accede al material", async () => {
    base();
    await assert.rejects(MaterialService.listar("rec", ajeno), (e) => e.status === 404);
  });

  test("S10-08 · HU-038 · el material de un curso despublicado no se entrega al aprendiz", async () => {
    base();
    await assert.rejects(MaterialService.listar("bor", aprendiz), (e) => e.status === 409);
  });

  test("S10-09 · HU-038 · el adjunto de una actividad tampoco se firma para un aprendiz sin el curso", async () => {
    base();
    const res = { codigo: 200, status(c) { this.codigo = c; return this; }, json(b) { this.cuerpo = b; return this; } };
    await ActivitiesController.adjunto({ params: { id: "rec" }, user: ajeno }, res);
    assert.equal(res.codigo, 404);
  });
});

describe("Consultar entregas pendientes", () => {
  test("S10-10 · HU-047 · el instructor ve solo las entregas de sus cursos, por revisar y de la más antigua a la más nueva", async () => {
    base();
    const r = await EntregaService.bandeja(instructor);
    assert.deepEqual(r.entregas.map((e) => e.id), ["e3", "e1"]);
    assert.ok(!r.entregas.some((e) => e.id === "e5"), "no ve la entrega de un curso que no dicta");
  });

  test("S10-11 · HU-047 · se puede ordenar de la más nueva a la más antigua", async () => {
    base();
    const r = await EntregaService.bandeja(instructor, { orden: "recientes" });
    assert.deepEqual(r.entregas.map((e) => e.id), ["e1", "e3"]);
  });

  test("S10-12 · HU-047 · se filtra por estado y los contadores salen siempre completos", async () => {
    base();
    const r = await EntregaService.bandeja(instructor, { estado: "aprobada" });
    assert.deepEqual(r.entregas.map((e) => e.id), ["e4"]);
    assert.deepEqual(r.contadores, { porRevisar: 2, rehacer: 1, aprobadas: 1, total: 4 });
  });

  test("S10-13 · HU-047 · cada entrega trae su actividad, su curso y el aprendiz", async () => {
    base();
    const [primera] = (await EntregaService.bandeja(instructor)).entregas;
    assert.deepEqual(primera.actividad, { id: "tar", titulo: "Informe" });
    assert.deepEqual(primera.curso, { id: "c1", nombre: "Inducción" });
    assert.equal(primera.aprendiz.firstname, "Beto");
  });

  test("S10-14 · HU-047 · el administrador ve las de toda su organización", async () => {
    base();
    const r = await EntregaService.bandeja(admin);
    assert.deepEqual(r.entregas.map((e) => e.id), ["e5", "e3", "e1"]);
  });

  test("S10-15 · HU-047 · un estado inventado responde 400 y un curso que no dicta 404", async () => {
    base();
    await assert.rejects(EntregaService.bandeja(instructor, { estado: "quiza" }), (e) => e.status === 400);
    await assert.rejects(EntregaService.bandeja(instructor, { cursoId: "c2" }), (e) => e.status === 404);
  });
});

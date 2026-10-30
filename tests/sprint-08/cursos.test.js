// Sprint 8 · Editar, publicar, archivar y eliminar cursos (HU-028, HU-033, HU-029).
const { preparar, estado } = require("../soporte/supabaseFalso.js");
const { test, describe, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const AvisoService = require("../../services/avisoService.js");
const CourseService = require("../../services/courseService.js");

AvisoService.instructorAsignado = () => {}; // sin correos

const admin = { id: "u-admin", role: "admin", tenantId: "t1", email: "admin@t1.com" };
const instructor = { id: "u-inst", role: "instructor", tenantId: "t1", email: "inst@t1.com" };
const otroInstructor = { id: "u-otro", role: "instructor", tenantId: "t1", email: "otro@t1.com" };
const adminAjeno = { id: "u-x", role: "admin", tenantId: "t2", email: "x@t2.com" };

function base({ conActividades = true, status = "Cerrado", archivado = false } = {}) {
  preparar({
    tablas: {
      courses: [{ id: "c1", tenant_id: "t1", name: "Inducción", instructor: "inst@t1.com", status, archivado, banner_url: null }],
      sections: [{ id: "s1", course_id: "c1", orden: 0 }],
      activities: conActividades ? [{ id: "a1", section_id: "s1", orden: 0, adjunto: "t1/manual.pdf" }] : [],
      materiales: [{ activity_id: "a1", ruta: "t1/guia.pdf" }],
      entregas: [{ activity_id: "a1", archivo: "t1/entrega.png" }],
      users: [
        { id: "u-inst", email: "inst@t1.com", role: "instructor", status: "Active", tenant_id: "t1" },
        { id: "u-otro", email: "otro@t1.com", role: "instructor", status: "Active", tenant_id: "t1" },
      ],
      groups_courses: [], users_groups: [], intentos_examen: [], xp_movimientos: [],
    },
  });
}

describe("Editar curso", () => {
  beforeEach(() => base());

  test("S8-01 · HU-028 · el administrador cambia el nombre del curso", async () => {
    const r = await CourseService.actualizar("c1", admin, { name: "Inducción 2026" });
    assert.equal(r.message, "Curso actualizado");
    assert.equal(estado.tablas.courses[0].name, "Inducción 2026");
  });

  test("S8-02 · HU-028 · sin cambios para guardar responde 400", async () => {
    await assert.rejects(CourseService.actualizar("c1", admin, {}), (e) => e.status === 400);
  });

  test("S8-03 · HU-028 · un instructor no edita un curso que no dicta", async () => {
    await assert.rejects(CourseService.actualizar("c1", otroInstructor, { name: "x" }), (e) => e.status === 403);
  });

  test("S8-04 · HU-028 · un instructor no se reasigna el curso a sí mismo ni a otro", async () => {
    await assert.rejects(
      CourseService.actualizar("c1", instructor, { instructor: "otro@t1.com" }),
      (e) => e.status === 403
    );
  });

  test("S8-05 · HU-028 · un curso de otra organización responde 404", async () => {
    await assert.rejects(CourseService.actualizar("c1", adminAjeno, { name: "x" }), (e) => e.status === 404);
  });
});

describe("Publicar o despublicar un curso", () => {
  test("S8-06 · HU-033 · publicar un curso con actividades lo deja Abierto", async () => {
    base();
    const r = await CourseService.publicar("c1", admin, true);
    assert.equal(r.status, "Abierto");
    assert.equal(estado.tablas.courses[0].status, "Abierto");
  });

  test("S8-07 · HU-033 · un curso sin actividades no se puede publicar", async () => {
    base({ conActividades: false });
    await assert.rejects(CourseService.publicar("c1", admin, true), (e) => e.status === 409);
  });

  test("S8-08 · HU-033 · publicar sin indicar true o false responde 400", async () => {
    base();
    await assert.rejects(CourseService.publicar("c1", admin, "si"), (e) => e.status === 400);
  });

  test("S8-09 · HU-033 · despublicar no borra contenido, solo cambia el estado", async () => {
    base({ status: "Abierto" });
    await CourseService.publicar("c1", admin, false);
    assert.equal(estado.tablas.courses[0].status, "Cerrado");
    assert.equal(estado.tablas.activities.length, 1);
  });

  test("S8-10 · HU-033 · el aprendiz no puede rendir actividades de un curso despublicado", async () => {
    base({ status: "Cerrado" });
    const { asegurarPublicado } = require("../../helpers/cursoDeActividad.js");
    await assert.rejects(asegurarPublicado("a1", { role: "student" }), (e) => e.status === 409);
    await assert.doesNotReject(asegurarPublicado("a1", { role: "instructor" }));
  });
});

describe("Eliminar o archivar un curso", () => {
  test("S8-11 · HU-029 · archivar conserva todo y se puede deshacer", async () => {
    base({ status: "Abierto" });
    await CourseService.archivar("c1", admin, true);
    assert.equal(estado.tablas.courses[0].archivado, true);
    assert.ok(estado.tablas.courses[0].archivado_at);
    await CourseService.archivar("c1", admin, false);
    assert.equal(estado.tablas.courses[0].archivado, false);
    assert.equal(estado.tablas.activities.length, 1);
  });

  test("S8-12 · HU-029 · el aprendiz no puede rendir actividades de un curso archivado", async () => {
    base({ status: "Abierto", archivado: true });
    const { asegurarPublicado } = require("../../helpers/cursoDeActividad.js");
    await assert.rejects(asegurarPublicado("a1", { role: "student" }), (e) => /archivado/.test(e.message));
  });

  test("S8-13 · HU-029 · antes de borrar se informa qué se pierde", async () => {
    base();
    const r = await CourseService.impacto("c1", admin);
    assert.equal(r.actividades, 1);
    assert.equal(r.secciones, 1);
    assert.equal(r.curso.nombre, "Inducción");
  });

  test("S8-14 · HU-029 · eliminar borra actividades y también sus archivos del almacenamiento", async () => {
    base();
    const r = await CourseService.eliminar("c1", admin);
    assert.equal(estado.tablas.courses.length, 0);
    assert.equal(estado.tablas.activities.length, 0);
    assert.equal(r.archivosBorrados, 3);
    const borrados = estado.escrituras.filter((e) => e.operacion === "remove").flatMap((e) => e.rutas);
    assert.deepEqual(borrados.sort(), ["t1/entrega.png", "t1/guia.pdf", "t1/manual.pdf"]);
  });

  test("S8-15 · HU-029 · un instructor no borra un curso que no dicta", async () => {
    base();
    await assert.rejects(CourseService.eliminar("c1", otroInstructor), (e) => e.status === 403);
    assert.equal(estado.tablas.courses.length, 1);
  });
});

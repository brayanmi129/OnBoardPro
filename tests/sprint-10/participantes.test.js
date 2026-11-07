// Sprint 10 · Participantes de un curso: instructor, grupos y aprendices,
// para que el aprendiz vea con quién comparte el curso (HU-035).
const { preparar } = require("../soporte/supabaseFalso.js");
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const CourseService = require("../../services/courseService.js");

const aprendiz = { id: "u1", role: "student", tenantId: "t1", email: "ana@t1.com" };
const ajeno = { id: "u9", role: "student", tenantId: "t1", email: "zoe@t1.com" };
const instructor = { id: "i1", role: "instructor", tenantId: "t1", email: "inst@t1.com" };
const otroInstructor = { id: "i2", role: "instructor", tenantId: "t1", email: "otro@t1.com" };
const admin = { id: "a1", role: "admin", tenantId: "t1", email: "admin@t1.com" };
const adminAjeno = { id: "a2", role: "admin", tenantId: "t2", email: "admin@t2.com" };

const base = () => preparar({
  tablas: {
    courses: [{ id: "c1", tenant_id: "t1", name: "Inducción", instructor: "inst@t1.com", status: "Abierto", archivado: false }],
    groups: [{ id: "g1", name: "Ventas" }, { id: "g2", name: "Administración" }],
    groups_courses: [{ id_group: "g1", id_course: "c1" }, { id_group: "g2", id_course: "c1" }],
    users_groups: [
      { id_user: "u1", id_group: "g1" },
      { id_user: "u2", id_group: "g1" },
      { id_user: "u2", id_group: "g2" },
      { id_user: "u3", id_group: "g2" },
      { id_user: "i1", id_group: "g2" },
    ],
    users: [
      { id: "u1", firstname: "Ana", lastname: "Gil", email: "ana@t1.com", role: "student", level: 2, status: "Active" },
      { id: "u2", firstname: "Beto", lastname: "Paz", email: "beto@t1.com", role: "student", level: 1, status: "Active" },
      { id: "u3", firstname: "Caro", lastname: "Ríos", email: "caro@t1.com", role: "student", level: 0, status: "Inactive" },
      { id: "u9", firstname: "Zoe", lastname: "Luz", email: "zoe@t1.com", role: "student", level: 0, status: "Active" },
      { id: "i1", firstname: "Inés", lastname: "Mora", email: "inst@t1.com", role: "instructor", status: "Active", phonumber: "3001234567" },
    ],
  },
});

describe("Participantes del curso", () => {
  test("S10-29 · HU-035 · el aprendiz ve al instructor, los grupos y sus compañeros, sin duplicados", async () => {
    base();
    const r = await CourseService.participantes("c1", aprendiz);
    assert.equal(r.instructor.firstname, "Inés");
    assert.equal(r.instructor.email, "inst@t1.com");
    assert.equal(r.instructor.telefono, "3001234567");
    assert.deepEqual(r.grupos.map((g) => g.nombre), ["Administración", "Ventas"]);
    assert.deepEqual(r.aprendices.map((a) => a.firstname), ["Ana", "Beto"]);
    assert.equal(r.total, 2);
  });

  test("S10-30 · HU-035 · no aparecen ni el instructor entre los aprendices ni la gente inactiva", async () => {
    base();
    const r = await CourseService.participantes("c1", aprendiz);
    assert.ok(!r.aprendices.some((a) => a.id === "i1" || a.id === "u3"));
  });

  test("S10-31 · HU-035 · al aprendiz no le llegan los correos de sus compañeros; a la administración sí", async () => {
    base();
    const comoAprendiz = await CourseService.participantes("c1", aprendiz);
    assert.ok(comoAprendiz.aprendices.every((a) => a.email === undefined));
    const comoAdmin = await CourseService.participantes("c1", admin);
    assert.equal(comoAdmin.aprendices[0].email, "ana@t1.com");
  });

  test("S10-32 · HU-035 · un aprendiz sin el curso, un instructor que no lo dicta u otra organización reciben 404", async () => {
    base();
    for (const actor of [ajeno, otroInstructor, adminAjeno]) {
      await assert.rejects(CourseService.participantes("c1", actor), (e) => e.status === 404);
    }
    const r = await CourseService.participantes("c1", instructor);
    assert.equal(r.total, 2);
  });
});

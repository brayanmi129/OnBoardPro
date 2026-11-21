// Sprint 11 · Cursos para toda la organización: un curso con para_todos lo
// tienen todos los aprendices activos de su organización, estén o no en un grupo.
const { preparar, estado } = require("../soporte/supabaseFalso.js");
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const CourseService = require("../../services/courseService.js");
const GamificationService = require("../../services/gamificationService.js");
const DashboardService = require("../../services/dashboardService.js");
const CursoIntroduccionService = require("../../services/cursoIntroduccionService.js");
const { cursosAsignados } = require("../../helpers/asignacion.js");

const sinGrupo = { id: "u1", role: "student", tenantId: "t1", email: "ana@t1.com" };
const enGrupo = { id: "u2", role: "student", tenantId: "t1", email: "beto@t1.com" };
const deOtra = { id: "z1", role: "student", tenantId: "t2", email: "zoe@t2.com" };
const admin = { id: "a1", role: "admin", tenantId: "t1", email: "admin@t1.com" };
const instructor = { id: "i1", role: "instructor", tenantId: "t1", email: "inst@t1.com" };
const superadmin = { id: "s1", role: "superadmin", tenantId: null, email: "super@ob.com" };

const base = () => preparar({
  tablas: {
    tenants: [{ id: "t1", name: "Acme", active: true }, { id: "t2", name: "Otra", active: true }],
    courses: [
      // Para toda la organización t1.
      { id: "todos", tenant_id: "t1", name: "Bienvenida", instructor: "inst@t1.com", status: "Abierto", archivado: false, para_todos: true },
      // Solo por grupo.
      { id: "grupal", tenant_id: "t1", name: "Ventas", instructor: "inst@t1.com", status: "Abierto", archivado: false, para_todos: false },
      // Para toda la organización t2.
      { id: "ajeno", tenant_id: "t2", name: "De la otra", instructor: null, status: "Abierto", archivado: false, para_todos: true },
    ],
    groups: [{ id: "g1", tenant_id: "t1", name: "Ventas" }],
    groups_courses: [{ id: 1, id_group: "g1", id_course: "grupal" }],
    users_groups: [{ id: 1, id_user: "u2", id_group: "g1" }],
    users: [
      { id: "u1", tenant_id: "t1", firstname: "Ana", lastname: "Gil", email: "ana@t1.com", role: "student", level: 1, status: "Active", xp: 0 },
      { id: "u2", tenant_id: "t1", firstname: "Beto", lastname: "Paz", email: "beto@t1.com", role: "student", level: 0, status: "Active", xp: 0 },
      { id: "u3", tenant_id: "t1", firstname: "Caro", lastname: "Ríos", email: "caro@t1.com", role: "student", level: 0, status: "Inactive", xp: 0 },
      { id: "z1", tenant_id: "t2", firstname: "Zoe", lastname: "Luz", email: "zoe@t2.com", role: "student", level: 0, status: "Active", xp: 0 },
      { id: "i1", tenant_id: "t1", firstname: "Inés", lastname: "Mora", email: "inst@t1.com", role: "instructor", status: "Active", xp: 0 },
      { id: "a1", tenant_id: "t1", firstname: "Ada", lastname: "Ruiz", email: "admin@t1.com", role: "admin", status: "Active", xp: 0 },
    ],
    sections: [{ id: "s1", course_id: "todos", name: "Inicio", orden: 0 }],
    activities: [{ id: "act1", section_id: "s1", tenant_id: "t1", name: "Bienvenida", type: "Recurso", xp: 10 }],
    xp_movimientos: [{ id: "m1", user_id: "u1", activity_id: "act1", xp: 10, created_at: new Date().toISOString() }],
  },
  rpc: (fn) => (fn === "ranking_curso" ? { data: [{ user_id: "u1", xp: 10 }], error: null } : { data: null, error: null }),
});

describe("Cursos para toda la organización", () => {
  test("S11-70 · HU-024 · un aprendiz sin grupos ve el curso para toda su organización y no el de otra", async () => {
    base();
    const cursos = await CourseService.getByUser("u1", { soloPublicados: true });
    assert.deepEqual(cursos.map((c) => c.id), ["todos"]);
    assert.equal(cursos[0].paraTodos, true);
    const deZoe = await CourseService.getByUser("z1", { soloPublicados: true });
    assert.deepEqual(deZoe.map((c) => c.id), ["ajeno"]);
  });

  test("S11-71 · HU-024 · el curso para todos se puede abrir sin grupo; uno solo por grupo sigue respondiendo 404", async () => {
    base();
    const r = await CourseService.participantes("todos", sinGrupo);
    assert.equal(r.paraTodos, true);
    await assert.rejects(CourseService.participantes("grupal", sinGrupo), (e) => e.status === 404);
    await assert.rejects(CourseService.participantes("todos", deOtra), (e) => e.status === 404);
    // El aprendiz del grupo tiene los dos.
    assert.deepEqual([...await cursosAsignados("u2")].sort(), ["grupal", "todos"]);
  });

  test("S11-72 · HU-035 · participantes y ranking incluyen a los aprendices activos sin grupo", async () => {
    base();
    const p = await CourseService.participantes("todos", admin);
    assert.deepEqual(p.aprendices.map((a) => a.id).sort(), ["u1", "u2"], "Caro está inactiva y Zoe es de otra organización");
    const ranking = await GamificationService.rankingDeCurso("todos", admin, { periodo: "semana" });
    const lista = Array.isArray(ranking) ? ranking : ranking.ranking || ranking.lista || [];
    assert.deepEqual(lista.map((x) => x.id).sort(), ["u1", "u2"]);
  });

  test("S11-73 · HU-078 · el panel de la organización cuenta a todos sus aprendices activos en el curso para todos", async () => {
    base();
    const r = await DashboardService.de(admin, { dias: 30 });
    const curso = r.cursosDetalle.find((c) => c.id === "todos");
    assert.equal(curso.aprendices, 2);
    assert.equal(curso.completaron, 1, "Ana completó la única actividad");
  });

  test("S11-74 · HU-024 · solo el administrador activa paraTodos; el instructor y el superadmin reciben 403", async () => {
    base();
    await assert.rejects(CourseService.actualizar("grupal", instructor, { paraTodos: true }), (e) => e.status === 403);
    await assert.rejects(CourseService.actualizar("grupal", superadmin, { paraTodos: true }), (e) => e.status === 403);
    await assert.rejects(CourseService.createCourse({ name: "Nuevo", instructor: "inst@t1.com", tenantId: "t1", paraTodos: true }, "instructor"), (e) => e.status === 403);
    await CourseService.actualizar("grupal", admin, { paraTodos: true });
    assert.equal(estado.tablas.courses.find((c) => c.id === "grupal").para_todos, true);
    const creado = await CourseService.createCourse({ name: "Nuevo", instructor: "inst@t1.com", tenantId: "t1", paraTodos: true }, "admin");
    assert.equal(creado.paraTodos, true);
    assert.equal(estado.tablas.courses.find((c) => c.name === "Nuevo").para_todos, true);
  });

  test("S11-75 · HU-024 · sin la columna para_todos en la base todo sigue como antes", async () => {
    base();
    // Simula la base sin la columna: ningún curso la tiene.
    for (const c of estado.tablas.courses) delete c.para_todos;
    const cursos = await CourseService.getByUser("u1", { soloPublicados: true });
    assert.deepEqual(cursos, []);
    const cursosBeto = await CourseService.getByUser("u2", { soloPublicados: true });
    assert.deepEqual(cursosBeto.map((c) => c.id), ["grupal"]);
    assert.equal(cursosBeto[0].paraTodos, false);
  });

  test("S11-76 · HU-024 · el curso de introducción se crea para toda la organización y el script puede marcar uno existente", async () => {
    base();
    const r = await CursoIntroduccionService.crearEn("t1", { videos: {} });
    assert.equal(r.creado, true);
    const intro = estado.tablas.courses.find((c) => c.name === CursoIntroduccionService.definicion().nombre);
    assert.equal(intro.para_todos, true);
    intro.para_todos = false;
    const m = await CursoIntroduccionService.marcarParaTodos("t1");
    assert.equal(m.marcado, true);
    assert.equal(intro.para_todos, true);
    assert.deepEqual(await CursoIntroduccionService.marcarParaTodos("t2"), { marcado: false, motivo: "sin curso" });
  });
});

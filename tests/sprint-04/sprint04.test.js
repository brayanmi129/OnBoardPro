// Sprint 4: consultar usuarios con filtros (HU-015), organizar el curso en
// secciones (HU-032), gestionar integrantes de un grupo (HU-023) y consultar
// cursos (HU-027).
process.env.MAIL_PROVIDER = "consola";
process.env.SUPABASE_URL = "http://supabase.falso";
process.env.SUPABASE_SECRET_KEY = "clave-falsa";

require("../soporte/supabaseFalso.js");
const { preparar, estado, resFalsa } = require("./soporte.js");
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const UserService = require("../../services/userService.js");
const UserController = require("../../controllers/userController.js");
const SectionService = require("../../services/sectionService.js");
const SectionController = require("../../controllers/sectionController.js");
const GroupService = require("../../services/groupService.js");
const GroupController = require("../../controllers/groupsControler.js");
const CourseService = require("../../services/courseService.js");
const CourseController = require("../../controllers/courseController.js");

const rechaza = (promesa, status, texto) =>
  assert.rejects(promesa, (e) => e.status === status && (!texto || e.message.includes(texto)));

// ───────────────────────────── HU-015 ─────────────────────────────
const usuarios = () => [
  { id: "u1", tenant_id: "t1", firstname: "Ana", lastname: "Pérez", email: "ana@acme.com", role: "student", status: "Active", password: "hash" },
  { id: "u2", tenant_id: "t1", firstname: "Bruno", lastname: "Díaz", email: "bruno@acme.com", role: "instructor", status: "Active", password: "hash" },
  { id: "u3", tenant_id: "t1", firstname: "Carla", lastname: "Gómez", email: "carla@acme.com", role: "student", status: "Inactive", password: "hash" },
  { id: "u4", tenant_id: "t1", firstname: "Diego", lastname: "Ruiz", email: "diego@acme.com", role: "admin", status: "Active", password: "hash" },
  { id: "u5", tenant_id: "t2", firstname: "Ana", lastname: "Otra", email: "ana@globex.com", role: "student", status: "Active", password: "hash" },
];
const tenants = [{ id: "t1", name: "Acme" }, { id: "t2", name: "Globex" }];

describe("Consultar usuarios con filtros", () => {
  test("S4-01 · HU-015 · un admin solo ve personas de su organización, sin contraseña y con el nombre de la empresa", async () => {
    preparar({ tablas: { users: usuarios(), tenants } });
    const r = await UserService.getAll("t1");
    assert.deepEqual(r.usuarios.map((u) => u.id), ["u1", "u2", "u3", "u4"]);
    assert.ok(r.usuarios.every((u) => u.tenantId === "t1" && u.tenantName === "Acme"));
    assert.ok(r.usuarios.every((u) => !("password" in u)));
    assert.equal(r.total, 4);
  });

  test("S4-02 · HU-015 · los filtros de rol, estado y texto se combinan y la búsqueda ignora mayúsculas", async () => {
    preparar({ tablas: { users: usuarios(), tenants } });
    const activos = await UserService.getAll("t1", { rol: "student", estado: "Active" });
    assert.deepEqual(activos.usuarios.map((u) => u.id), ["u1"]);

    const porApellido = await UserService.getAll("t1", { buscar: "  díaz " });
    assert.deepEqual(porApellido.usuarios.map((u) => u.id), ["u2"]);

    const porCorreo = await UserService.getAll("t1", { buscar: "ACME.COM", rol: "student" });
    assert.deepEqual(porCorreo.usuarios.map((u) => u.id), ["u1", "u3"]);
  });

  test("S4-03 · HU-015 · la paginación devuelve la página pedida, el total y la cantidad de páginas", async () => {
    preparar({ tablas: { users: usuarios(), tenants } });
    const r = await UserService.getAll("t1", { pagina: "2", porPagina: "3" });
    assert.deepEqual(r.usuarios.map((u) => u.firstname), ["Diego"]);
    assert.deepEqual([r.total, r.pagina, r.porPagina, r.paginas], [4, 2, 3, 2]);

    const borde = await UserService.getAll("t1", { pagina: "-5", porPagina: "9999" });
    assert.equal(borde.pagina, 1);
    assert.equal(borde.porPagina, 200);
  });

  test("S4-04 · HU-015 · el endpoint ignora la organización para el superadmin y manda la paginación en cabeceras", async () => {
    preparar({ tablas: { users: usuarios(), tenants } });
    const res = resFalsa();
    await UserController.getAll({ user: { role: "superadmin" }, query: { buscar: "ana", porPagina: "1" } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.length, 1);
    assert.equal(res.headers["X-Total-Count"], "2"); // Ana de Acme y Ana de Globex
    assert.equal(res.headers["X-Total-Pages"], "2");

    const resAdmin = resFalsa();
    await UserController.getAll({ user: { role: "admin", tenantId: "t2" }, query: {} }, resAdmin);
    assert.deepEqual(resAdmin.body.map((u) => u.id), ["u5"]);
  });

  test(
    "S4-05 · HU-015 · un texto de búsqueda con comas no puede agregar condiciones al filtro",
    { todo: "posible bug: services/userService.js:133 arma el filtro .or() interpolando `buscar` sin escapar; una coma permite inyectar condiciones de PostgREST (p. ej. role.eq.admin) y un nombre con coma rompe la consulta" },
    async () => {
      preparar({ tablas: { users: usuarios(), tenants } });
      const r = await UserService.getAll("t1", { buscar: "zzz%,role.eq.admin,email.ilike.%zzz" });
      assert.equal(r.total, 0);
    }
  );
});

// ───────────────────────────── HU-032 ─────────────────────────────
const cursos = () => [
  { id: "c1", tenant_id: "t1", name: "Inducción", instructor: "bruno@acme.com", status: "Abierto", archivado: false },
  { id: "c2", tenant_id: "t1", name: "Seguridad", instructor: "bruno@acme.com", status: "Cerrado", archivado: false },
  { id: "c9", tenant_id: "t2", name: "Ajeno", instructor: "x@globex.com", status: "Abierto", archivado: false },
];

describe("Organizar el curso en secciones", () => {
  test("S4-06 · HU-032 · una sección nueva queda al final del curso y hereda la organización del curso", async () => {
    preparar({
      tablas: {
        courses: cursos(),
        sections: [
          { id: "s1", course_id: "c1", tenant_id: "t1", name: "Bienvenida", orden: 0 },
          { id: "s2", course_id: "c1", tenant_id: "t1", name: "Políticas", orden: 1 },
          { id: "s9", course_id: "c9", tenant_id: "t2", name: "Otra", orden: 0 },
        ],
      },
    });
    const s = await SectionService.crear("c1", "t1", { name: "Cierre", tenantId: "t2" });
    assert.equal(s.orden, 2);
    assert.equal(s.courseId, "c1");
    assert.equal(s.tenantId, "t1");
    assert.deepEqual(s.actividades, []);
    const guardada = estado.tablas.sections.find((x) => x.id === s.id);
    assert.equal(guardada.tenant_id, "t1");
  });

  test("S4-07 · HU-032 · se respeta la posición pedida; sin nombre responde 400 y en un curso ajeno 404", async () => {
    preparar({ tablas: { courses: cursos(), sections: [] } });
    const primera = await SectionService.crear("c1", "t1", { name: "Intro", orden: 0 });
    assert.equal(primera.orden, 0);

    await assert.rejects(SectionService.crear("c1", "t1", { name: "" }),
      (e) => e.status === 400 && e.campos.some((c) => c.campo === "name"));
    await rechaza(SectionService.crear("c9", "t1", { name: "Intrusa" }), 404, "Curso no encontrado");
    assert.equal(estado.tablas.sections.length, 1);
  });

  test("S4-08 · HU-032 · el listado sale en orden con sus actividades y el aprendiz no ve secciones vacías", async () => {
    preparar({
      tablas: {
        courses: cursos(),
        sections: [
          { id: "s2", course_id: "c1", tenant_id: "t1", name: "Segunda", orden: 1 },
          { id: "s1", course_id: "c1", tenant_id: "t1", name: "Primera", orden: 0 },
          { id: "s3", course_id: "c1", tenant_id: "t1", name: "Vacía", orden: 2 },
        ],
        activities: [
          { id: "a2", section_id: "s1", title: "B", orden: 1 },
          { id: "a1", section_id: "s1", title: "A", orden: 0 },
          { id: "a3", section_id: "s2", title: "C", orden: 0 },
        ],
        xp_movimientos: [{ user_id: "u1", activity_id: "a1" }],
        entregas: [],
      },
    });
    const editor = await SectionService.listar("c1", "t1");
    assert.deepEqual(editor.map((s) => s.name), ["Primera", "Segunda", "Vacía"]);
    assert.deepEqual(editor[0].actividades.map((a) => a.id), ["a1", "a2"]);

    const res = resFalsa();
    await SectionController.listar({ params: { id: "c1" }, user: { id: "u1", role: "student", tenantId: "t1" } }, res);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body.map((s) => s.name), ["Primera", "Segunda"]);
    assert.equal(res.body[0].actividades[0].completada, true);
    assert.equal(res.body[0].actividades[1].completada, false);
  });

  test("S4-09 · HU-032 · un curso despublicado o de otra organización responde 404 al listar sus secciones", async () => {
    preparar({ tablas: { courses: cursos(), sections: [] } });
    const res = resFalsa();
    await SectionController.listar({ params: { id: "c2" }, user: { id: "u1", role: "student", tenantId: "t1" } }, res);
    assert.equal(res.statusCode, 404);

    const ajeno = resFalsa();
    await SectionController.listar({ params: { id: "c9" }, user: { id: "u4", role: "admin", tenantId: "t1" } }, ajeno);
    assert.equal(ajeno.statusCode, 404);
  });

  test("S4-10 · HU-032 · una sección con actividades no se borra (409); vacía sí, y renombrar sin nombre responde 400", async () => {
    preparar({
      tablas: {
        sections: [
          { id: "s1", course_id: "c1", tenant_id: "t1", name: "Con contenido", orden: 0 },
          { id: "s2", course_id: "c1", tenant_id: "t1", name: "Vacía", orden: 1 },
        ],
        activities: [{ id: "a1", section_id: "s1" }, { id: "a2", section_id: "s1" }],
      },
    });
    await rechaza(SectionService.eliminar("s1", "t1"), 409, "2 actividad");
    assert.deepEqual(await SectionService.eliminar("s2", "t1"), { message: "Sección eliminada" });
    assert.deepEqual(estado.tablas.sections.map((s) => s.id), ["s1"]);

    await rechaza(SectionService.renombrar("s1", "t1", "   "), 400, "vacío");
    await rechaza(SectionService.renombrar("s1", "t2", "Nuevo"), 404);
    await SectionService.renombrar("s1", "t1", "  Módulo 1  ");
    assert.equal(estado.tablas.sections[0].name, "Módulo 1");
  });

  test(
    "S4-11 · HU-032 · después de borrar una sección intermedia, la nueva sigue quedando al final",
    { todo: "posible bug: services/sectionService.js:136 usa la CANTIDAD de secciones como orden; con órdenes 0 y 2 (se borró la 1) la nueva recibe orden 2 y empata con la última en vez de ir después" },
    async () => {
      preparar({
        tablas: {
          courses: cursos(),
          sections: [
            { id: "s1", course_id: "c1", tenant_id: "t1", name: "A", orden: 0 },
            { id: "s3", course_id: "c1", tenant_id: "t1", name: "C", orden: 2 },
          ],
        },
      });
      const s = await SectionService.crear("c1", "t1", { name: "D" });
      assert.ok(s.orden > 2, `quedó con orden ${s.orden}`);
    }
  );
});

// ───────────────────────────── HU-023 ─────────────────────────────
const datosGrupos = () => ({
  users: usuarios(),
  groups: [
    { id: "g1", tenant_id: "t1", name: "Ventas" },
    { id: "g9", tenant_id: "t2", name: "Ajeno" },
  ],
  users_groups: [{ id_user: "u1", id_group: "g1" }],
});

describe("Gestionar integrantes de un grupo", () => {
  test("S4-12 · HU-023 · se agregan integrantes de la organización y volver a agregar a alguien no lo duplica", async () => {
    preparar({ tablas: datosGrupos() });
    const r = await GroupService.addUsersToGroup("g1", ["u1", "u2", "u2"], "t1");
    assert.equal(r.message, "Usuarios agregados al grupo correctamente");
    const deG1 = estado.tablas.users_groups.filter((x) => x.id_group === "g1").map((x) => x.id_user).sort();
    assert.deepEqual(deG1, ["u1", "u2"]);
  });

  test("S4-13 · HU-023 · una persona de otra organización responde 400 y un grupo ajeno 404, sin escribir nada", async () => {
    preparar({ tablas: datosGrupos() });
    await rechaza(GroupService.addUsersToGroup("g1", ["u2", "u5"], "t1"), 400, "u5");
    await rechaza(GroupService.addUsersToGroup("g9", ["u2"], "t1"), 404, "Grupo no encontrado");
    // El superadmin no tiene empresa: la regla sale del grupo, no de quien llama.
    await rechaza(GroupService.addUsersToGroup("g1", ["u5"], null), 400, "u5");
    assert.equal(estado.escrituras.length, 0);
    assert.equal(estado.tablas.users_groups.length, 1);
  });

  test("S4-14 · HU-023 · quitar integrantes saca solo a los indicados y una lista vacía responde 400", async () => {
    preparar({
      tablas: {
        ...datosGrupos(),
        users_groups: [
          { id_user: "u1", id_group: "g1" }, { id_user: "u2", id_group: "g1" }, { id_user: "u1", id_group: "g2" },
        ],
      },
    });
    const vacia = resFalsa();
    await GroupController.removeUsers({ params: { id: "g1" }, body: { userIds: [] }, user: { role: "admin", tenantId: "t1" } }, vacia);
    assert.equal(vacia.statusCode, 400);

    const ajeno = resFalsa();
    await GroupController.removeUsers({ params: { id: "g9" }, body: { userIds: ["u5"] }, user: { role: "admin", tenantId: "t1" } }, ajeno);
    assert.equal(ajeno.statusCode, 404);

    const ok = resFalsa();
    await GroupController.removeUsers({ params: { id: "g1" }, body: { userIds: ["u1"] }, user: { role: "admin", tenantId: "t1" } }, ok);
    assert.equal(ok.statusCode, 200);
    assert.deepEqual(estado.tablas.users_groups, [{ id_user: "u2", id_group: "g1" }, { id_user: "u1", id_group: "g2" }]);

    await rechaza(GroupService.addUsersToGroup("g1", [], "t1"), 400, "al menos un usuario");
  });
});

// ───────────────────────────── HU-027 ─────────────────────────────
const catalogo = () => ({
  courses: [
    ...cursos(),
    { id: "c3", tenant_id: "t1", name: "Archivo viejo", instructor: "otro@acme.com", status: "Abierto", archivado: true },
    { id: "c4", tenant_id: "t1", name: "Atención al cliente", instructor: "otro@acme.com", status: "Abierto", archivado: false },
  ],
  sections: [
    { id: "s1", course_id: "c1", orden: 1 }, { id: "s0", course_id: "c1", orden: 0 },
  ],
  activities: [
    { id: "a1", section_id: "s1", orden: 0 }, { id: "a0", section_id: "s0", orden: 0 },
  ],
  tenants,
});

describe("Consultar cursos", () => {
  test("S4-15 · HU-027 · el catálogo oculta archivados, busca por nombre y arma las actividades desde las secciones", async () => {
    preparar({ tablas: catalogo() });
    const r = await CourseService.getAll("t1");
    assert.deepEqual(r.cursos.map((c) => c.name), ["Atención al cliente", "Inducción", "Seguridad"]);
    const induccion = r.cursos.find((c) => c.id === "c1");
    assert.deepEqual(induccion.actividades, ["a0", "a1"]);
    assert.equal(induccion.tenantName, "Acme");

    assert.deepEqual((await CourseService.getAll("t1", { archivados: "solo" })).cursos.map((c) => c.id), ["c3"]);
    assert.equal((await CourseService.getAll("t1", { archivados: "incluir" })).total, 4);
    assert.deepEqual((await CourseService.getAll("t1", { buscar: "INDUC" })).cursos.map((c) => c.id), ["c1"]);
  });

  test("S4-16 · HU-027 · el instructor ve solo lo que dicta y nadie ve cursos de otra organización", async () => {
    preparar({ tablas: catalogo() });
    const res = resFalsa();
    await CourseController.getAll(
      { user: { role: "instructor", email: "bruno@acme.com", tenantId: "t1" }, query: { archivados: "incluir" } }, res);
    assert.deepEqual(res.body.map((c) => c.id).sort(), ["c1", "c2"]);
    assert.equal(res.headers["X-Total-Count"], "2");

    const ajeno = resFalsa();
    await CourseController.getById({ params: { id: "c9" }, user: { role: "admin", tenantId: "t1" } }, ajeno);
    assert.equal(ajeno.statusCode, 404);

    const cerrado = resFalsa();
    await CourseController.getById({ params: { id: "c2" }, user: { role: "student", tenantId: "t1" } }, cerrado);
    assert.equal(cerrado.statusCode, 404);

    const superadmin = resFalsa();
    await CourseController.getById({ params: { id: "c9" }, user: { role: "superadmin" } }, superadmin);
    assert.equal(superadmin.statusCode, 200);
  });

  test(
    "S4-17 · HU-027 · el aprendiz no ve cursos despublicados en el catálogo",
    { todo: "posible bug: controllers/courseController.js:39-48 oculta archivados al aprendiz pero no fuerza estado=Abierto; GET /courses/get/all le muestra cursos Cerrados, aunque getById (línea 69) los trata como inexistentes" },
    async () => {
      preparar({ tablas: catalogo() });
      const res = resFalsa();
      await CourseController.getAll({ user: { role: "student", tenantId: "t1" }, query: {} }, res);
      assert.ok(res.body.every((c) => c.status === "Abierto"), "aparece un curso Cerrado");
    }
  );
});

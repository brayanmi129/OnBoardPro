// HU-006 · Aislamiento de datos entre organizaciones: cada consulta filtra por
// la empresa del token y lo ajeno se trata como inexistente.
process.env.JWT_SECRET = "secreto-de-prueba-sprint-3";
require("../soporte/supabaseFalso.js");
const { preparar, estado, respuesta, enSilencio } = require("./soporte.js");
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const CourseController = require("../../controllers/courseController.js");
const GroupController = require("../../controllers/groupsControler.js");
const UserService = require("../../services/userService.js");

const adminAcme = { id: "a1", email: "admin@acme.com", role: "admin", tenantId: "t1" };
const adminGlobex = { id: "a2", email: "admin@globex.com", role: "admin", tenantId: "t2" };

const datos = () => ({
  tenants: [{ id: "t1", name: "Acme" }, { id: "t2", name: "Globex" }],
  courses: [
    { id: "c1", name: "Ventas Acme", instructor: "i@acme.com", status: "Abierto", tenant_id: "t1", archivado: false },
    { id: "c2", name: "Seguridad Acme", instructor: "i@acme.com", status: "Abierto", tenant_id: "t1", archivado: false },
    { id: "c9", name: "Secreto Globex", instructor: "i@globex.com", status: "Abierto", tenant_id: "t2", archivado: false },
  ],
  groups: [
    { id: "g1", name: "Cohorte Acme", tenant_id: "t1" },
    { id: "g9", name: "Cohorte Globex", tenant_id: "t2" },
  ],
  users: [
    { id: "u1", email: "ana@acme.com", firstname: "Ana", role: "student", status: "Active", tenant_id: "t1" },
    { id: "u9", email: "luis@globex.com", firstname: "Luis", role: "student", status: "Active", tenant_id: "t2" },
  ],
  users_groups: [{ id_user: "u9", id_group: "g9" }],
  groups_courses: [],
  sections: [],
  activities: [],
});

const llamar = (fn, req) =>
  enSilencio(async () => {
    const res = respuesta();
    await fn({ params: {}, query: {}, body: {}, ...req }, res);
    return res;
  });

const escriturasEn = (tabla) =>
  estado.escrituras.filter((e) => e.tabla === tabla && e.operacion !== "select");

describe("Aislamiento de datos entre organizaciones", () => {
  test("S3-05 · HU-006 · los listados de cursos, grupos y usuarios solo traen la organización del token", async () => {
    preparar({ tablas: datos() });

    const cursos = await llamar(CourseController.getAll, { user: adminAcme });
    assert.equal(cursos.statusCode, 200);
    assert.deepEqual(cursos.cuerpo.map((c) => c.id).sort(), ["c1", "c2"]);
    assert.equal(cursos.cabeceras["X-Total-Count"], "2");

    const grupos = await llamar(GroupController.getAll, { user: adminGlobex });
    assert.deepEqual(grupos.cuerpo.map((g) => g.id), ["g9"]);

    const usuarios = await UserService.getAll("t1");
    assert.deepEqual(usuarios.usuarios.map((u) => u.id), ["u1"]);
    assert.ok(usuarios.usuarios.every((u) => !("password" in u)));

    // El superadmin es el único sin filtro de empresa.
    const todos = await llamar(CourseController.getAll, { user: { id: "s", role: "superadmin" } });
    assert.equal(todos.cuerpo.length, 3);
  });

  test("S3-06 · HU-006 · un curso o grupo de otra empresa responde 404 al verlo, editarlo o borrarlo y no se modifica", async () => {
    preparar({ tablas: datos() });

    const ver = await llamar(CourseController.getById, { user: adminAcme, params: { id: "c9" } });
    assert.equal(ver.statusCode, 404);

    const editar = await llamar(CourseController.update, {
      user: adminAcme, params: { id: "c9" }, body: { name: "Hackeado" },
    });
    assert.equal(editar.statusCode, 404);
    assert.equal(estado.tablas.courses.find((c) => c.id === "c9").name, "Secreto Globex");

    const verGrupo = await llamar(GroupController.getById, { user: adminAcme, params: { id: "g9" } });
    assert.equal(verGrupo.statusCode, 404);

    const meterse = await llamar(GroupController.addUsers, {
      user: adminAcme, params: { id: "g9" }, body: { userIds: ["u1"] },
    });
    assert.equal(meterse.statusCode, 404);

    const borrar = await llamar(GroupController.delete, { user: adminAcme, params: { id: "g9" } });
    assert.equal(borrar.statusCode, 404);
    assert.ok(estado.tablas.groups.some((g) => g.id === "g9"), "el grupo ajeno sigue existiendo");

    assert.equal(escriturasEn("courses").length, 0);
    assert.equal(escriturasEn("groups").length, 0);
    assert.equal(escriturasEn("users_groups").length, 0);
  });

  test("S3-07 · HU-006 · un admin no puede editar ni borrar personas de otra empresa, ni mover a alguien de empresa", async () => {
    preparar({ tablas: datos() });

    const editar = await UserService.updateUser("u9", { firstname: "Pirata" }, "t1", adminAcme);
    assert.equal(editar.status, 404);
    assert.equal(estado.tablas.users.find((u) => u.id === "u9").firstname, "Luis");

    await assert.rejects(UserService.deleteUser("u9", "t1"), (e) => e.status === 404);
    assert.ok(estado.tablas.users.some((u) => u.id === "u9"), "la persona ajena no se borró");

    // Sobre alguien propio, mandar tenantId en el cuerpo no lo cambia de empresa.
    const propio = await UserService.updateUser("u1", { firstname: "Ana María", tenantId: "t2" }, "t1", adminAcme);
    assert.ok(!propio.error, JSON.stringify(propio));
    const ana = estado.tablas.users.find((u) => u.id === "u1");
    assert.equal(ana.firstname, "Ana María");
    assert.equal(ana.tenant_id, "t1");
  });

  test(
    "S3-08 · HU-006 · editar un grupo de otra empresa responde 404 como el resto de operaciones",
    {
      todo:
        "posible bug: GroupController.update (controllers/groupsControler.js:114) responde 400 cuando " +
        "updateGroup devuelve 'Grupo no encontrado'; ver/borrar/agregar responden 404",
    },
    async () => {
      preparar({ tablas: datos() });
      const res = await llamar(GroupController.update, {
        user: adminAcme, params: { id: "g9" }, body: { name: "Mío ahora" },
      });
      assert.equal(estado.tablas.groups.find((g) => g.id === "g9").name, "Cohorte Globex");
      assert.equal(res.statusCode, 404);
    }
  );
});

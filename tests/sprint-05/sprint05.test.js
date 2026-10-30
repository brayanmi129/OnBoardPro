// Sprint 5: editar usuario (HU-016), eliminar usuario (HU-017), asignar y
// cambiar rol con auditoría (HU-018), consultar grupos (HU-021) y editar y
// eliminar grupo (HU-022).
process.env.MAIL_PROVIDER = "consola";
process.env.SUPABASE_URL = "http://supabase.falso";
process.env.SUPABASE_SECRET_KEY = "clave-falsa";

require("../soporte/supabaseFalso.js");
const { preparar, estado, resFalsa } = require("./soporte.js");
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcrypt");
const UserService = require("../../services/userService.js");
const UserController = require("../../controllers/userController.js");
const GroupService = require("../../services/groupService.js");
const GroupController = require("../../controllers/groupsControler.js");

const adminAcme = { id: "u4", email: "diego@acme.com", role: "admin", tenantId: "t1" };
const superadmin = { id: "sa1", email: "root@onboardpro.com", role: "superadmin", tenantId: null };

const usuarios = () => [
  { id: "u1", tenant_id: "t1", firstname: "Ana", lastname: "Pérez", email: "ana@acme.com", role: "student", status: "Active", password: "hash-viejo" },
  { id: "u2", tenant_id: "t1", firstname: "Bruno", lastname: "Díaz", email: "bruno@acme.com", role: "instructor", status: "Active" },
  { id: "u4", tenant_id: "t1", firstname: "Diego", lastname: "Ruiz", email: "diego@acme.com", role: "admin", status: "Active" },
  { id: "u5", tenant_id: "t2", firstname: "Eva", lastname: "Sol", email: "eva@globex.com", role: "student", status: "Active" },
  { id: "sa1", tenant_id: null, firstname: "Root", email: "root@onboardpro.com", role: "superadmin", status: "Active" },
];
const fila = (id) => estado.tablas.users.find((u) => u.id === id);

async function editar(actor, id, body) {
  const res = resFalsa();
  await UserController.updateUser({ params: { id }, body, user: actor }, res);
  return res;
}
async function borrar(actor, id) {
  const res = resFalsa();
  await UserController.deleteUser({ params: { id }, user: actor }, res);
  return res;
}

// ───────────────────────────── HU-016 ─────────────────────────────
describe("Editar usuario", () => {
  test("S5-01 · HU-016 · se cambian solo los campos enviados y la contraseña nueva se guarda cifrada", async () => {
    preparar({ tablas: { users: usuarios(), role_changes: [] } });
    const res = await editar(adminAcme, "u1", { firstname: "Ana María", password: "Nueva#2026" });
    assert.equal(res.statusCode, 200);
    const u = fila("u1");
    assert.equal(u.firstname, "Ana María");
    assert.equal(u.lastname, "Pérez");
    assert.equal(u.email, "ana@acme.com");
    assert.notEqual(u.password, "Nueva#2026");
    assert.equal(await bcrypt.compare("Nueva#2026", u.password), true);
  });

  test("S5-02 · HU-016 · un correo mal escrito, un estado inventado o un campo desconocido responden 400 sin guardar nada", async () => {
    preparar({ tablas: { users: usuarios() } });
    const correo = await editar(adminAcme, "u1", { email: "no-es-un-correo" });
    assert.equal(correo.statusCode, 400);
    assert.equal(correo.body.error, "Datos inválidos");
    assert.ok(correo.body.details.some((d) => d.startsWith("email")));

    assert.equal((await editar(adminAcme, "u1", { status: "Suspendido" })).statusCode, 400);
    assert.equal((await editar(adminAcme, "u1", { salario: 1000 })).statusCode, 400);
    assert.equal(estado.escrituras.length, 0);
    assert.equal(fila("u1").email, "ana@acme.com");
  });

  test("S5-03 · HU-016 · un admin no edita personas de otra organización (404) ni puede mudar a alguien de empresa", async () => {
    preparar({ tablas: { users: usuarios() } });
    const ajeno = await editar(adminAcme, "u5", { firstname: "Intruso" });
    assert.equal(ajeno.statusCode, 404);
    assert.equal(fila("u5").firstname, "Eva");

    const mudanza = await editar(adminAcme, "u1", { tenantId: "t2", lastname: "Pérez Gil" });
    assert.equal(mudanza.statusCode, 200);
    assert.equal(fila("u1").tenant_id, "t1");
    assert.equal(fila("u1").lastname, "Pérez Gil");
  });

  test(
    "S5-04 · HU-016 · el identificador de un usuario no se puede cambiar al editarlo",
    { todo: "posible bug: services/userService.js:227 valida con UserSchema.schema.partial(), que acepta `id`; mandar { id } en el cuerpo reescribe la clave primaria (y deja colgadas sus filas en users_groups, xp_movimientos, etc.)" },
    async () => {
      preparar({ tablas: { users: usuarios() } });
      const res = await editar(adminAcme, "u1", { id: "otro-id" });
      assert.ok(fila("u1"), "el usuario u1 ya no existe con ese id");
      assert.notEqual(res.statusCode, 200);
    }
  );

  test(
    "S5-05 · HU-016 · la respuesta de editar no expone el hash de la contraseña",
    { todo: "posible bug: services/userService.js:254 devuelve `updatedData: validation.data`, que incluye el password ya cifrado; el controlador (controllers/userController.js:111) lo manda tal cual al cliente" },
    async () => {
      preparar({ tablas: { users: usuarios() } });
      const res = await editar(adminAcme, "u1", { password: "Nueva#2026" });
      assert.equal(res.statusCode, 200);
      assert.equal(res.body.updatedData.password, undefined);
    }
  );
});

// ───────────────────────────── HU-017 ─────────────────────────────
describe("Eliminar usuario", () => {
  test("S5-06 · HU-017 · un admin elimina a una persona de su organización; si no existe o es de otra, responde 404", async () => {
    preparar({ tablas: { users: usuarios() } });
    const ok = await borrar(adminAcme, "u2");
    assert.equal(ok.statusCode, 200);
    assert.equal(fila("u2"), undefined);

    const ajeno = await borrar(adminAcme, "u5");
    assert.equal(ajeno.statusCode, 404);
    assert.ok(fila("u5"), "no debía borrarse a alguien de otra empresa");

    const inexistente = await borrar(adminAcme, "zzz");
    assert.equal(inexistente.statusCode, 404);
    assert.equal(inexistente.body.message, "Usuario no encontrado");
  });

  test("S5-07 · HU-017 · el superadmin puede eliminar personas de cualquier organización", async () => {
    preparar({ tablas: { users: usuarios() } });
    const res = await borrar(superadmin, "u5");
    assert.equal(res.statusCode, 200);
    assert.equal(fila("u5"), undefined);
    assert.equal(estado.tablas.users.length, 4);
  });

  test(
    "S5-08 · HU-017 · un admin no puede eliminar a un superadmin aunque comparta organización",
    { todo: "posible bug: services/userService.js:187-196 (deleteUser) no tiene la protección explícita de superadmin que sí tiene updateUser (línea 215); un superadmin con tenant_id queda borrable por un admin de esa empresa" },
    async () => {
      preparar({ tablas: { users: [...usuarios(), { id: "sa2", tenant_id: "t1", email: "sa2@acme.com", role: "superadmin", status: "Active" }] } });
      const res = await borrar(adminAcme, "sa2");
      assert.equal(res.statusCode, 403);
      assert.ok(fila("sa2"));
    }
  );
});

// ───────────────────────────── HU-018 ─────────────────────────────
describe("Asignar y cambiar rol", () => {
  test("S5-09 · HU-018 · un cambio de rol queda auditado con autor, organización, rol anterior y nuevo", async () => {
    preparar({ tablas: { users: usuarios(), role_changes: [] } });
    const res = await editar(adminAcme, "u1", { role: "instructor" });
    assert.equal(res.statusCode, 200);
    assert.equal(fila("u1").role, "instructor");
    assert.equal(estado.tablas.role_changes.length, 1);
    const a = estado.tablas.role_changes[0];
    assert.deepEqual(
      { user_id: a.user_id, tenant_id: a.tenant_id, rol_anterior: a.rol_anterior, rol_nuevo: a.rol_nuevo, autor_id: a.autor_id, autor_email: a.autor_email },
      { user_id: "u1", tenant_id: "t1", rol_anterior: "student", rol_nuevo: "instructor", autor_id: "u4", autor_email: "diego@acme.com" }
    );
    assert.match(a.id, /^[0-9a-f]{16}$/);
  });

  test("S5-10 · HU-018 · sin cambio real de rol no se audita, y un rol inexistente responde 400", async () => {
    preparar({ tablas: { users: usuarios(), role_changes: [] } });
    assert.equal((await editar(adminAcme, "u1", { role: "student" })).statusCode, 200);
    assert.equal((await editar(adminAcme, "u1", { firstname: "Ana" })).statusCode, 200);
    const inventado = await editar(adminAcme, "u1", { role: "gerente" });
    assert.equal(inventado.statusCode, 400);
    assert.ok(inventado.body.details.some((d) => d.startsWith("role")));
    assert.equal(fila("u1").role, "student");
    assert.equal(estado.tablas.role_changes.length, 0);
  });

  test("S5-11 · HU-018 · un admin no puede dar el rol superadmin ni tocar a un superadmin (403), y no queda auditoría", async () => {
    preparar({
      tablas: {
        users: [...usuarios(), { id: "sa2", tenant_id: "t1", email: "sa2@acme.com", role: "superadmin", status: "Active" }],
        role_changes: [],
      },
    });
    const escalar = await editar(adminAcme, "u1", { role: "superadmin" });
    assert.equal(escalar.statusCode, 403);
    assert.equal(fila("u1").role, "student");

    const degradar = await editar(adminAcme, "sa2", { role: "student" });
    assert.equal(degradar.statusCode, 403);
    assert.equal(fila("sa2").role, "superadmin");

    assert.equal(estado.escrituras.length, 0);
  });

  test("S5-12 · HU-018 · un admin no cambia el rol de alguien de otra organización (404); el superadmin sí, y queda firmado", async () => {
    preparar({ tablas: { users: usuarios(), role_changes: [] } });
    const ajeno = await editar(adminAcme, "u5", { role: "admin" });
    assert.equal(ajeno.statusCode, 404);
    assert.equal(fila("u5").role, "student");
    assert.equal(estado.tablas.role_changes.length, 0);

    const res = await editar(superadmin, "u5", { role: "admin" });
    assert.equal(res.statusCode, 200);
    assert.equal(fila("u5").role, "admin");
    assert.equal(estado.tablas.role_changes[0].autor_email, "root@onboardpro.com");
    assert.equal(estado.tablas.role_changes[0].tenant_id, "t2");
  });
});

// ───────────────────────────── HU-021 / HU-022 ─────────────────────────────
const datosGrupos = () => ({
  users: usuarios(),
  groups: [
    { id: "g1", tenant_id: "t1", name: "Ventas", description: "Equipo comercial" },
    { id: "g2", tenant_id: "t1", name: "Soporte", description: "" },
    { id: "g9", tenant_id: "t2", name: "Ajeno", description: "" },
  ],
  users_groups: [
    { id_user: "u1", id_group: "g1" }, { id_user: "u2", id_group: "g1" }, { id_user: "u5", id_group: "g9" },
  ],
  groups_courses: [{ id_group: "g1", id_course: "c1" }, { id_group: "g9", id_course: "c9" }],
  courses: [
    { id: "c1", tenant_id: "t1", name: "Inducción" },
    { id: "c9", tenant_id: "t2", name: "Ajeno" },
  ],
});
const req = (user, extra = {}) => ({ user, params: {}, body: {}, ...extra });

describe("Consultar grupos", () => {
  test("S5-13 · HU-021 · un admin ve solo los grupos de su organización, con integrantes y cursos resueltos", async () => {
    preparar({ tablas: datosGrupos() });
    const res = resFalsa();
    await GroupController.getAll(req(adminAcme), res);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body.map((g) => g.id), ["g1", "g2"]);
    const ventas = res.body[0];
    assert.equal(ventas.tenantId, "t1");
    assert.deepEqual(ventas.users.map((u) => u.email), ["ana@acme.com", "bruno@acme.com"]);
    assert.deepEqual(ventas.courses.map((c) => c.id), ["c1"]);
    assert.deepEqual(res.body[1].users, []);
  });

  test("S5-14 · HU-021 · el detalle de un grupo de otra organización responde 404; el superadmin lo ve", async () => {
    preparar({ tablas: datosGrupos() });
    const ajeno = resFalsa();
    await GroupController.getById(req(adminAcme, { params: { id: "g9" } }), ajeno);
    assert.equal(ajeno.statusCode, 404);

    const propio = resFalsa();
    await GroupController.getById(req(adminAcme, { params: { id: "g1" } }), propio);
    assert.equal(propio.statusCode, 200);
    assert.equal(propio.body.users.length, 2);

    const sa = resFalsa();
    await GroupController.getById(req(superadmin, { params: { id: "g9" } }), sa);
    assert.equal(sa.statusCode, 200);
    assert.deepEqual(sa.body.users.map((u) => u.id), ["u5"]);
  });
});

describe("Editar y eliminar grupo", () => {
  test("S5-15 · HU-022 · se editan nombre y descripción; la organización del cuerpo se ignora y sin nombre responde 400", async () => {
    preparar({ tablas: datosGrupos() });
    const ok = resFalsa();
    await GroupController.update(
      req(adminAcme, { params: { id: "g1" }, body: { name: "Ventas LATAM", description: "Región sur", tenantId: "t2" } }), ok);
    assert.equal(ok.statusCode, 200);
    const g1 = estado.tablas.groups.find((g) => g.id === "g1");
    assert.deepEqual([g1.name, g1.description, g1.tenant_id], ["Ventas LATAM", "Región sur", "t1"]);

    const vacio = resFalsa();
    await GroupController.update(req(adminAcme, { params: { id: "g1" }, body: { name: "" } }), vacio);
    assert.equal(vacio.statusCode, 400);
    assert.ok(vacio.body.details.some((d) => d.startsWith("name")));
    assert.equal(g1.name, "Ventas LATAM");
  });

  test(
    "S5-16 · HU-022 · editar un grupo de otra organización responde 404 y no lo modifica",
    { todo: "posible bug: services/groupService.js:299 devuelve { error } sin status y controllers/groupsControler.js:114 responde siempre 400; un grupo ajeno o inexistente da 400 en vez de 404 (eliminar sí da 404)" },
    async () => {
      preparar({ tablas: datosGrupos() });
      const res = resFalsa();
      await GroupController.update(req(adminAcme, { params: { id: "g9" }, body: { name: "Hackeado" } }), res);
      assert.equal(estado.tablas.groups.find((g) => g.id === "g9").name, "Ajeno");
      assert.equal(res.statusCode, 404);
    }
  );

  test("S5-17 · HU-022 · un admin elimina un grupo propio; uno ajeno o inexistente responde 404 y sigue intacto", async () => {
    preparar({ tablas: datosGrupos() });
    const ok = resFalsa();
    await GroupController.delete(req(adminAcme, { params: { id: "g2" } }), ok);
    assert.equal(ok.statusCode, 200);
    assert.equal(estado.tablas.groups.some((g) => g.id === "g2"), false);

    const ajeno = resFalsa();
    await GroupController.delete(req(adminAcme, { params: { id: "g9" } }), ajeno);
    assert.equal(ajeno.statusCode, 404);
    assert.equal(ajeno.body, "Grupo no encontrado");
    assert.ok(estado.tablas.groups.some((g) => g.id === "g9"));

    const inexistente = resFalsa();
    await GroupController.delete(req(adminAcme, { params: { id: "nope" } }), inexistente);
    assert.equal(inexistente.statusCode, 404);
  });
});

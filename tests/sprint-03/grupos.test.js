// HU-020 · Crear grupo: controlador, servicio y esquema zod.
process.env.JWT_SECRET = "secreto-de-prueba-sprint-3";
require("../soporte/supabaseFalso.js");
const { preparar, estado, respuesta, pasarPor, enSilencio } = require("./soporte.js");
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const GroupController = require("../../controllers/groupsControler.js");
const requireRole = require("../../middlewares/requireRole.js");

const adminAcme = { id: "a1", role: "admin", tenantId: "t1" };
const datos = () => ({
  groups: [],
  users_groups: [],
  users: [
    { id: "u1", email: "ana@acme.com", role: "student", tenant_id: "t1" },
    { id: "u2", email: "beto@acme.com", role: "student", tenant_id: "t1" },
    { id: "u9", email: "luis@globex.com", role: "student", tenant_id: "t2" },
  ],
});

const crear = (user, body) =>
  enSilencio(async () => {
    const res = respuesta();
    await GroupController.create({ user, body }, res);
    return res;
  });

describe("Crear grupo", () => {
  test("S3-17 · HU-020 · un admin crea un grupo con integrantes de su empresa; la empresa sale del token", async () => {
    preparar({ tablas: datos() });
    const res = await crear(adminAcme, {
      name: "Cohorte octubre", description: "Ingresos del mes", userIds: ["u1", "u2"], tenantId: "t2",
    });
    assert.equal(res.statusCode, 201);
    assert.equal(res.cuerpo.tenantId, "t1");
    assert.equal(res.cuerpo.name, "Cohorte octubre");
    assert.ok(!("userIds" in res.cuerpo));

    assert.equal(estado.tablas.groups.length, 1);
    assert.equal(estado.tablas.groups[0].tenant_id, "t1");
    assert.deepEqual(
      estado.tablas.users_groups.map((r) => r.id_user).sort(),
      ["u1", "u2"]
    );
    assert.ok(estado.tablas.users_groups.every((r) => r.id_group === res.cuerpo.id));
  });

  test("S3-18 · HU-020 · si algún integrante es de otra organización o no existe responde 400 y no se crea el grupo", async () => {
    preparar({ tablas: datos() });
    const ajeno = await crear(adminAcme, { name: "Mezcla", userIds: ["u1", "u9"] });
    assert.equal(ajeno.statusCode, 400);
    assert.match(ajeno.cuerpo.error, /no pertenecen a la organización/);
    assert.match(ajeno.cuerpo.error, /u9/);
    assert.ok(!ajeno.cuerpo.error.includes("u1"), "solo nombra a los rechazados");

    const fantasma = await crear(adminAcme, { name: "Fantasma", userIds: ["zzz"] });
    assert.equal(fantasma.statusCode, 400);

    assert.equal(estado.tablas.groups.length, 0);
    assert.equal(estado.tablas.users_groups.length, 0);
  });

  test("S3-19 · HU-020 · nombre vacío, de más de 100 caracteres o un campo desconocido responden 400; un aprendiz recibe 403", async () => {
    preparar({ tablas: datos() });
    for (const [body, campo] of [
      [{ name: "" }, "name"],
      [{ name: "x".repeat(101) }, "name"],
      [{ description: "sin nombre" }, "name"],
    ]) {
      const res = await crear(adminAcme, body);
      assert.equal(res.statusCode, 400, JSON.stringify(body));
      assert.ok(res.cuerpo.campos.some((c) => c.campo === campo));
    }
    const extra = await crear(adminAcme, { name: "Ok", color: "rojo" });
    assert.equal(extra.statusCode, 400);
    assert.match(extra.cuerpo.error, /color/);

    const aprendiz = await pasarPor(
      [requireRole("admin", "superadmin", "instructor"), GroupController.create],
      { user: { id: "u1", role: "student", tenantId: "t1" }, body: { name: "Mío" } }
    );
    assert.equal(aprendiz.statusCode, 403);
    assert.equal(estado.tablas.groups.length, 0);
  });
});

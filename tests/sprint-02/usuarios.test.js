// Sprint 2: crear usuario (HU-014).
process.env.JWT_SECRET = "secreto-de-pruebas";
const { preparar, estado, respuesta, silenciarConsola, fallarEn } = require("./soporte.js");
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcrypt");
const UserService = require("../../services/userService.js");
const UserController = require("../../controllers/userController.js");
const AuthService = require("../../services/authService.js");

silenciarConsola();

const admin = { id: "u-adm", email: "adm@empresa.com", role: "admin", tenantId: "t-emp" };
const superadmin = { id: "u-root", email: "root@onboardpro.com", role: "superadmin", tenantId: null };
const tablas = () => ({
  tenants: [
    { id: "t-emp", name: "Empresa SA", domain: "empresa.com", active: true },
    { id: "t-otra", name: "Otra SA", domain: "otra.com", active: true },
  ],
  users: [],
});
const inserciones = () => estado.escrituras.filter((e) => e.tabla === "users" && e.operacion === "insert");
const crear = async (user, body) => {
  const res = respuesta();
  await UserController.create({ user, body }, res);
  return res;
};

describe("Crear usuario", () => {
  test("S2-09 · HU-014 · un admin crea un usuario en su empresa: 201, contraseña hasheada y nunca devuelta, rol aprendiz por defecto", async () => {
    preparar({ tablas: tablas() });
    const res = await crear(admin, {
      email: "nuevo@empresa.com", firstname: "Nuevo", password: "ClaveSegura123", tenantId: "t-otra",
    });
    assert.equal(res.statusCode, 201);
    assert.equal("password" in res.body, false);
    assert.equal(res.body.tenantId, "t-emp", "el tenant sale del token, no del cuerpo");
    assert.equal(res.body.role, "student");
    assert.equal(res.body.status, "Active");

    const fila = inserciones()[0].valores;
    assert.equal(fila.tenant_id, "t-emp");
    assert.notEqual(fila.password, "ClaveSegura123");
    assert.equal(await bcrypt.compare("ClaveSegura123", fila.password), true);
  });

  test("S2-10 · HU-014 · un admin no puede crear un superadmin (403) y no se guarda nada", async () => {
    preparar({ tablas: tablas() });
    const res = await crear(admin, { email: "jefe@empresa.com", role: "superadmin" });
    assert.equal(res.statusCode, 403);
    assert.equal(inserciones().length, 0);
  });

  test("S2-11 · HU-014 · el superadmin elige la empresa del nuevo usuario y puede crear otros superadmins", async () => {
    preparar({ tablas: tablas() });
    const enOtra = await crear(superadmin, { email: "ana@otra.com", role: "admin", tenantId: "t-otra" });
    assert.equal(enOtra.statusCode, 201);
    assert.equal(enOtra.body.tenantId, "t-otra");
    assert.equal(enOtra.body.role, "admin");

    const otroSuper = await crear(superadmin, { email: "root2@onboardpro.com", role: "superadmin" });
    assert.equal(otroSuper.statusCode, 201);
    assert.equal(otroSuper.body.role, "superadmin");
    assert.equal(inserciones().length, 2);
  });

  test("S2-12 · HU-014 · el esquema rechaza correo inválido, rol fuera del catálogo y campos desconocidos con 400 indicando el campo", async () => {
    preparar({ tablas: tablas() });
    const casos = [
      [{ email: "no-es-un-correo" }, "email"],
      [{ email: "a@empresa.com", role: "jefe" }, "role"],
      [{ email: "a@empresa.com", sueldo: 1000 }, "(raíz)"],
      [{ email: "a@empresa.com", firstname: "x".repeat(51) }, "firstname"],
    ];
    for (const [datos, campo] of casos) {
      await assert.rejects(UserService.create({ ...datos, tenantId: "t-emp" }), (e) =>
        e.status === 400 && e.campos.some((c) => c.campo === campo)
      );
    }
    assert.equal(inserciones().length, 0);
  });

  test(
    "S2-13 · HU-014 · el endpoint responde 400 (no 500) cuando los datos del usuario son inválidos",
    { todo: "posible bug: controllers/userController.js:18 pregunta error instanceof zod.ZodError, pero UserService.create lanza un Error común con status 400 (helpers/validacion.js); el chequeo nunca se cumple y un correo mal escrito sale como 500" },
    async () => {
      preparar({ tablas: tablas() });
      const res = await crear(admin, { email: "no-es-un-correo" });
      assert.equal(res.statusCode, 400);
    }
  );

  test(
    "S2-14 · HU-014 · un correo que ya está registrado responde 409",
    { todo: "posible bug: services/userService.js:89 no comprueba si el correo existe; la restricción UNIQUE de la base lo frena pero controllers/userController.js:21 lo devuelve como 500 con el mensaje de Postgres" },
    async () => {
      preparar({ tablas: tablas() });
      const restaurar = fallarEn("users", { code: "23505", message: 'duplicate key value violates unique constraint "users_email_key"' });
      try {
        const res = await crear(admin, { email: "repetido@empresa.com" });
        assert.equal(res.statusCode, 409);
      } finally {
        restaurar();
      }
    }
  );

  test(
    "S2-15 · HU-014 · el correo se guarda en minúsculas para que el usuario creado pueda entrar luego con Microsoft",
    { todo: "posible bug: services/userService.js:89 guarda el correo tal como llega, pero services/authService.js:112 busca con el UPN de Microsoft en minúsculas; un usuario creado como \"Sara@Empresa.com\" no se encuentra y se le crea una segunda cuenta como aprendiz" },
    async () => {
      preparar({ tablas: tablas() });
      const res = await crear(admin, { email: "Sara@Empresa.com", role: "instructor" });
      assert.equal(res.statusCode, 201);
      const r = await AuthService.OAuthMicrosoft({ _json: { userPrincipalName: "sara@empresa.com", givenName: "Sara" } });
      assert.equal(inserciones().length, 1, "no debía crearse una segunda cuenta");
      assert.equal(r?.userData?.role, "instructor");
    }
  );
});

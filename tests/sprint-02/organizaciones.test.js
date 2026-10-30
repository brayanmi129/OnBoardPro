// Sprint 2: crear organización (HU-001) y consultar organizaciones (HU-002).
process.env.JWT_SECRET = "secreto-de-pruebas";
const { preparar, estado, respuesta, correrMiddleware, silenciarConsola, fallarEn } = require("./soporte.js");
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const TenantService = require("../../services/tenantService.js");
const TenantController = require("../../controllers/tenantController.js");
const requireRole = require("../../middlewares/requireRole.js");

silenciarConsola();

const tablas = () => ({
  tenants: [
    { id: "t-emp", name: "Empresa SA", domain: "empresa.com", active: true, created_at: "2026-01-10T00:00:00Z" },
    { id: "t-baja", name: "Dada de baja", domain: "baja.com", active: false, created_at: "2026-02-01T00:00:00Z" },
  ],
});
const inserciones = () => estado.escrituras.filter((e) => e.tabla === "tenants" && e.operacion === "insert");
const crear = async (body) => {
  const res = respuesta();
  await TenantController.create({ body, user: { id: "u-root", role: "superadmin" } }, res);
  return res;
};
const DUPLICADO = { code: "23505", message: 'duplicate key value violates unique constraint "tenants_domain_key"' };

describe("Crear organización", () => {
  test("S2-01 · HU-001 · una organización nueva queda activa, con id generado y el dominio en minúsculas", async () => {
    preparar({ tablas: tablas() });
    const res = await crear({ name: "Acme Ltda", domain: "Acme.COM" });
    assert.equal(res.statusCode, 201);
    assert.equal(res.body.domain, "acme.com");
    assert.equal(res.body.active, true);
    assert.ok(res.body.id && res.body.id.length > 0);

    const fila = inserciones()[0].valores;
    assert.equal(fila.domain, "acme.com");
    assert.equal(fila.name, "Acme Ltda");
    assert.ok(fila.created_at, "la fecha se guarda en la columna created_at");
    assert.equal("createdAt" in fila, false);
  });

  test("S2-02 · HU-001 · un nombre vacío o de más de 100 caracteres responde 400 indicando el campo, sin guardar nada", async () => {
    preparar({ tablas: tablas() });
    for (const name of ["", "x".repeat(101)]) {
      const res = await crear({ name, domain: "nueva.com" });
      assert.equal(res.statusCode, 400);
      assert.match(res.body.message, /^name:/);
    }
    assert.equal(inserciones().length, 0);
  });

  test("S2-03 · HU-001 · solo el superadmin pasa el control de rol de organizaciones: admin recibe 403 y sin sesión 401", () => {
    const soloSuper = requireRole("superadmin");
    assert.equal(correrMiddleware(soloSuper, { user: { role: "superadmin" } }).siguio, true);

    const admin = correrMiddleware(soloSuper, { user: { role: "admin", tenantId: "t-emp" } });
    assert.equal(admin.siguio, false);
    assert.equal(admin.res.statusCode, 403);
    assert.match(admin.res.locals.motivo, /"admin"/);

    const anonimo = correrMiddleware(soloSuper, {});
    assert.equal(anonimo.siguio, false);
    assert.equal(anonimo.res.statusCode, 401);
  });

  test(
    "S2-04 · HU-001 · sin dominio responde 400 con un mensaje que nombra el campo domain",
    { todo: "posible bug: services/tenantService.js:18 hace data.domain.toLowerCase() antes de validar con zod; si falta el dominio el 400 lleva el mensaje interno \"Cannot read properties of undefined (reading 'toLowerCase')\"" },
    async () => {
      preparar({ tablas: tablas() });
      const res = await crear({ name: "Sin dominio" });
      assert.equal(res.statusCode, 400);
      assert.match(res.body.message, /domain/);
    }
  );

  test(
    "S2-05 · HU-001 · un dominio que ya usa otra organización responde 409",
    { todo: "posible bug: services/tenantService.js:13 no comprueba si el dominio ya existe y controllers/tenantController.js:9 devuelve 400 con el mensaje crudo de Postgres (\"duplicate key value violates unique constraint...\") en vez de 409" },
    async () => {
      preparar({ tablas: tablas() });
      const restaurar = fallarEn("tenants", DUPLICADO);
      try {
        const res = await crear({ name: "Otra Empresa", domain: "empresa.com" });
        assert.equal(res.statusCode, 409);
        assert.doesNotMatch(res.body.message, /duplicate key/);
      } finally {
        restaurar();
      }
    }
  );
});

describe("Consultar organizaciones", () => {
  test("S2-06 · HU-002 · el listado trae todas las organizaciones, activas e inactivas, con createdAt en vez de created_at", async () => {
    preparar({ tablas: tablas() });
    const res = respuesta();
    await TenantController.getAll({ user: { role: "superadmin" } }, res);
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.body.map((t) => [t.id, t.active]), [["t-emp", true], ["t-baja", false]]);
    assert.equal(res.body[0].createdAt, "2026-01-10T00:00:00Z");
    assert.equal("created_at" in res.body[0], false);
  });

  test("S2-07 · HU-002 · consultar una organización por id responde 200 si existe y 404 si no", async () => {
    preparar({ tablas: tablas() });
    let res = respuesta();
    await TenantController.getById({ params: { id: "t-baja" } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.name, "Dada de baja");

    res = respuesta();
    await TenantController.getById({ params: { id: "t-nada" } }, res);
    assert.equal(res.statusCode, 404);
  });

  test("S2-08 · HU-002 · si la base falla al listar se responde 500 y no una lista vacía", async () => {
    preparar({ tablas: tablas() });
    const restaurar = fallarEn("tenants", { message: "connection refused" });
    try {
      const res = respuesta();
      await TenantController.getAll({ user: { role: "superadmin" } }, res);
      assert.equal(res.statusCode, 500);
      assert.equal(Array.isArray(res.body), false);
    } finally {
      restaurar();
    }
  });
});

// Sprint 1: inicio de sesión con correo y contraseña (HU-007), ver mi perfil
// (HU-069) y cerrar sesión (HU-011).
process.env.JWT_SECRET = "secreto-de-pruebas";
const { preparar, respuesta, correrMiddleware, silenciarConsola } = require("./soporte.js");
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const AuthService = require("../../services/authService.js");
const AuthController = require("../../controllers/authController.js");
const verifyJWT = require("../../middlewares/jwt.js");

silenciarConsola();

// Costo bajo: solo importa que sea un hash bcrypt válido, no que sea lento.
const HASH = bcrypt.hashSync("ClaveSegura123", 4);

const ana = {
  id: "u-ana", email: "ana@empresa.com", password: HASH, firstname: "Ana", lastname: "Gómez",
  role: "admin", tenant_id: "t-emp", status: "Active", xp: 120, level: 2,
};
const oauth = { id: "u-luis", email: "luis@empresa.com", password: null, firstname: "Luis", role: "student", tenant_id: null };
const tablas = () => ({
  users: [ana, oauth],
  tenants: [{ id: "t-emp", name: "Empresa SA", domain: "empresa.com", active: true }],
});

const login = async (body) => {
  const res = respuesta();
  await AuthController.login({ body }, res);
  return res;
};

describe("Iniciar sesión con correo y contraseña", () => {
  test("S1-01 · HU-007 · el login con contraseña correcta devuelve un token con id, rol y organización, sin el hash", async () => {
    preparar({ tablas: tablas() });
    const res = await login({ email: "ana@empresa.com", password: "ClaveSegura123" });
    assert.equal(res.statusCode, 200);
    const pago = jwt.verify(res.body.token, process.env.JWT_SECRET);
    assert.equal(pago.id, "u-ana");
    assert.equal(pago.role, "admin");
    assert.equal(pago.tenantId, "t-emp");
    assert.equal(pago.email, "ana@empresa.com");
    assert.equal("password" in pago, false);
    assert.equal("password" in res.body.userData, false);
    assert.equal(res.body.userData.tenantId, "t-emp");
  });

  test("S1-02 · HU-007 · una contraseña incorrecta responde 401 y no emite token", async () => {
    preparar({ tablas: tablas() });
    const res = await login({ email: "ana@empresa.com", password: "otraClave" });
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.token, undefined);
    assert.match(res.body.message, /incorrectos/);
  });

  test("S1-03 · HU-007 · sin correo o sin contraseña responde 400", async () => {
    preparar({ tablas: tablas() });
    assert.equal((await login({ email: "ana@empresa.com" })).statusCode, 400);
    assert.equal((await login({ password: "ClaveSegura123" })).statusCode, 400);
    assert.equal((await login({ email: "", password: "" })).statusCode, 400);
  });

  test("S1-04 · HU-007 · una cuenta creada por Google o Microsoft no puede entrar con contraseña (401)", async () => {
    preparar({ tablas: tablas() });
    const res = await login({ email: "luis@empresa.com", password: "cualquiera" });
    assert.equal(res.statusCode, 401);
    assert.match(res.body.message, /Google o Microsoft/);
  });

  test(
    "S1-05 · HU-007 · un correo inexistente responde igual que una contraseña incorrecta",
    { todo: "posible bug: services/authService.js:38 responde 404 si el correo no existe y 401 si la contraseña falla; el mensaje es el mismo pero el código de estado permite averiguar qué correos tienen cuenta" },
    async () => {
      preparar({ tablas: tablas() });
      const noExiste = await login({ email: "nadie@empresa.com", password: "ClaveSegura123" });
      const malaClave = await login({ email: "ana@empresa.com", password: "otraClave" });
      assert.equal(noExiste.body.message, malaClave.body.message);
      assert.equal(noExiste.statusCode, malaClave.statusCode);
    }
  );
});

describe("Ver mi perfil", () => {
  test("S1-06 · HU-069 · el perfil trae los datos propios con el nombre de la empresa, sin el hash, e indica si la cuenta es solo de Google/Microsoft", async () => {
    preparar({ tablas: tablas() });
    const p = await AuthService.me("u-ana");
    assert.equal(p.firstname, "Ana");
    assert.equal(p.xp, 120);
    assert.equal(p.tenantName, "Empresa SA");
    assert.equal(p.oauthOnly, false);
    assert.equal("password" in p, false);

    const sinClave = await AuthService.me("u-luis");
    assert.equal(sinClave.oauthOnly, true);
    assert.equal(sinClave.tenantName, null);
    assert.equal("password" in sinClave, false);
  });

  test("S1-07 · HU-069 · el endpoint del perfil responde 200 con el usuario del token, 401 sin sesión y 404 si la cuenta ya no existe", async () => {
    preparar({ tablas: tablas() });
    let res = respuesta();
    await AuthController.me({ user: { id: "u-ana", role: "admin" } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.userData.id, "u-ana");

    res = respuesta();
    await AuthController.me({}, res);
    assert.equal(res.statusCode, 401);

    res = respuesta();
    await AuthController.me({ user: { id: "u-borrado", role: "student" } }, res);
    assert.equal(res.statusCode, 404);
  });

  test("S1-08 · HU-069 · el middleware JWT deja pasar un token válido y rechaza con 401 uno ausente, sin Bearer o de otra firma", () => {
    const valido = jwt.sign({ id: "u-ana", role: "admin", tenantId: "t-emp" }, process.env.JWT_SECRET);
    const req = { headers: { authorization: `Bearer ${valido}` } };
    const ok = correrMiddleware(verifyJWT, req);
    assert.equal(ok.siguio, true);
    assert.equal(req.user.id, "u-ana");
    assert.equal(req.user.tenantId, "t-emp");

    const ajeno = jwt.sign({ id: "u-ana", role: "superadmin" }, "otro-secreto");
    for (const authorization of [undefined, `Basic ${valido}`, `Bearer ${ajeno}`, "Bearer basura"]) {
      const r = correrMiddleware(verifyJWT, { headers: { authorization } });
      assert.equal(r.siguio, false, `no debía pasar: ${authorization}`);
      assert.equal(r.res.statusCode, 401);
    }
  });
});

describe("Cerrar sesión", () => {
  test("S1-09 · HU-011 · el token de sesión vence a las 3 horas", async () => {
    preparar({ tablas: tablas() });
    const res = await login({ email: "ana@empresa.com", password: "ClaveSegura123" });
    const { iat, exp } = jwt.decode(res.body.token);
    assert.equal(exp - iat, 3 * 60 * 60);
  });

  test("S1-10 · HU-011 · un token vencido se rechaza con 401 y el motivo dice que la sesión venció", () => {
    const ahora = Math.floor(Date.now() / 1000);
    const vencido = jwt.sign({ id: "u-ana", role: "admin", iat: ahora - 4 * 3600, exp: ahora - 3600 }, process.env.JWT_SECRET);
    const { res, siguio } = correrMiddleware(verifyJWT, { headers: { authorization: `Bearer ${vencido}` } });
    assert.equal(siguio, false);
    assert.equal(res.statusCode, 401);
    assert.match(res.locals.motivo, /venció/);
  });

  test(
    "S1-11 · HU-011 · existe un endpoint de cierre de sesión que invalida el token en el servidor",
    { todo: "posible bug: routes/authRoutes.js no define /logout ni lista de tokens revocados; cerrar sesión solo borra el token en el navegador y un token copiado sigue siendo válido hasta 3 h después" },
    () => {
      const router = require("../../routes/authRoutes.js");
      const rutas = router.stack.filter((l) => l.route).map((l) => l.route.path);
      assert.ok(rutas.includes("/logout"), `rutas: ${rutas.join(", ")}`);
    }
  );
});

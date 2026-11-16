// Sprint 11 · Contraseña temporal: quien recibe una contraseña puesta por otra
// persona tiene que cambiarla en su primer ingreso.
process.env.JWT_SECRET = "secreto-de-prueba-sprint-11";
const { preparar, estado, pasarPor, enSilencio, respuesta } = require("../sprint-03/soporte.js");
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const UserService = require("../../services/userService.js");
const AuthService = require("../../services/authService.js");
const AuthController = require("../../controllers/authController.js");
const verifyJWT = require("../../middlewares/jwt.js");

const HASH_TEMPORAL = bcrypt.hashSync("Temporal123", 4);
const admin = { id: "adm", role: "admin", tenantId: "t1", email: "admin@acme.com" };
const datos = () => ({
  tenants: [{ id: "t1", name: "Acme", active: true }],
  users: [
    { id: "adm", email: "admin@acme.com", role: "admin", status: "Active", password: HASH_TEMPORAL, tenant_id: "t1", debe_cambiar_password: false },
    { id: "nue", email: "nuevo@acme.com", firstname: "Nuevo", role: "student", status: "Active", password: HASH_TEMPORAL, tenant_id: "t1", debe_cambiar_password: true },
  ],
});
const fila = (id) => estado.tablas.users.find((u) => u.id === id);
const token = (claims) => jwt.sign(claims, process.env.JWT_SECRET);
const pedir = (claims, method, originalUrl) =>
  enSilencio(() => pasarPor([verifyJWT, (req, res) => res.status(200).json({ ok: true })], {
    headers: { authorization: `Bearer ${token(claims)}` },
    method,
    originalUrl,
  }));

describe("Contraseña temporal", () => {
  test("S11-50 · crear un usuario con contraseña la deja temporal; sin contraseña, no; el valor no lo decide quien llama", async () => {
    preparar({ tablas: datos() });
    await enSilencio(() => UserService.create({ firstname: "Ana", email: "ana@acme.com", password: "Inicial123", tenantId: "t1", debeCambiarPassword: false }));
    const ana = estado.tablas.users.find((u) => u.email === "ana@acme.com");
    assert.equal(ana.debe_cambiar_password, true);
    assert.equal("debeCambiarPassword" in ana, false, "en la base va en snake_case");
    assert.ok(await bcrypt.compare("Inicial123", ana.password));

    await enSilencio(() => UserService.create({ firstname: "Beto", email: "beto@acme.com", tenantId: "t1" }));
    assert.equal(estado.tablas.users.find((u) => u.email === "beto@acme.com").debe_cambiar_password, false);
  });

  test("S11-51 · el login con contraseña temporal responde 200 con el aviso y un token marcado", async () => {
    preparar({ tablas: datos() });
    const res = respuesta();
    await enSilencio(() => AuthController.login({ body: { email: "nuevo@acme.com", password: "Temporal123" } }, res));
    assert.equal(res.statusCode, 200);
    assert.equal(res.cuerpo.debeCambiarPassword, true);
    assert.equal(res.cuerpo.userData.debeCambiarPassword, true);
    assert.equal(jwt.decode(res.cuerpo.token).cambiarPassword, true);

    const normal = respuesta();
    await enSilencio(() => AuthController.login({ body: { email: "admin@acme.com", password: "Temporal123" } }, normal));
    assert.equal(normal.cuerpo.debeCambiarPassword, false);
    assert.equal(jwt.decode(normal.cuerpo.token).cambiarPassword, undefined);
  });

  test("S11-52 · con el token marcado solo se puede ver la sesión y cambiar la contraseña", async () => {
    preparar({ tablas: datos() });
    const marcado = { id: "nue", role: "student", tenantId: "t1", cambiarPassword: true };
    const bloqueada = await pedir(marcado, "GET", "/api/courses/get/all");
    assert.equal(bloqueada.statusCode, 403);
    assert.equal(bloqueada.cuerpo.codigo, "CAMBIO_PASSWORD_REQUERIDO");
    assert.equal((await pedir(marcado, "PUT", "/api/auth/me")).statusCode, 403, "editar el perfil tampoco");
    assert.equal((await pedir(marcado, "GET", "/api/auth/me?x=1")).statusCode, 200);
    assert.equal((await pedir(marcado, "POST", "/api/auth/change-password/")).statusCode, 200);
    assert.equal((await pedir({ id: "adm", role: "admin", tenantId: "t1" }, "GET", "/api/courses/get/all")).statusCode, 200);
  });

  test("S11-53 · cambiarla limpia la marca y devuelve un token nuevo; corta o igual a la temporal, no", async () => {
    preparar({ tablas: datos() });
    const corta = await enSilencio(() => AuthService.cambiarPassword("nue", "Temporal123", "corta"));
    assert.equal(corta.estado, 400);
    const igual = await enSilencio(() => AuthService.cambiarPassword("nue", "Temporal123", "Temporal123"));
    assert.equal(igual.estado, 400);
    assert.equal(fila("nue").debe_cambiar_password, true, "sigue temporal");

    const r = await enSilencio(() => AuthService.cambiarPassword("nue", "Temporal123", "MiClaveNueva9"));
    assert.equal(r.estado, 200);
    assert.equal(fila("nue").debe_cambiar_password, false);
    assert.ok(await bcrypt.compare("MiClaveNueva9", fila("nue").password));
    assert.equal(jwt.decode(r.token).cambiarPassword, undefined);
    assert.equal(jwt.decode(r.token).id, "nue");
    const me = await enSilencio(() => AuthService.me("nue"));
    assert.equal(me.debeCambiarPassword, false);
  });

  test("S11-54 · si un admin le pone una contraseña a otra persona vuelve a ser temporal; el admin no puede quitar la marca", async () => {
    preparar({ tablas: { ...datos(), users: datos().users.map((u) => ({ ...u, debe_cambiar_password: false })) } });
    await enSilencio(() => UserService.updateUser("nue", { password: "OtraTemporal1" }, "t1", admin));
    assert.equal(fila("nue").debe_cambiar_password, true);

    await enSilencio(() => UserService.updateUser("nue", { firstname: "Nuevo", debeCambiarPassword: false }, "t1", admin));
    assert.equal(fila("nue").debe_cambiar_password, true, "el campo del cuerpo se ignora");

    await enSilencio(() => UserService.updateUser("nue", { firstname: "Otro" }, "t1", admin));
    assert.equal(fila("nue").debe_cambiar_password, true, "editar otros datos no la toca");
  });
});

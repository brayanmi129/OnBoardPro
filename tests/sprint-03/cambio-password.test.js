// HU-071 · Cambiar mi contraseña: exige sesión y la contraseña actual.
process.env.JWT_SECRET = "secreto-de-prueba-sprint-3";
require("../soporte/supabaseFalso.js");
const { preparar, estado, pasarPor, enSilencio } = require("./soporte.js");
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const AuthService = require("../../services/authService.js");
const AuthController = require("../../controllers/authController.js");
const verifyJWT = require("../../middlewares/jwt.js");

const HASH_ANA = bcrypt.hashSync("ClaveActual1", 4);
const HASH_LUIS = bcrypt.hashSync("ClaveDeLuis1", 4);
const datos = () => ({
  users: [
    { id: "u1", email: "ana@acme.com", role: "student", status: "Active", password: HASH_ANA, tenant_id: "t1" },
    { id: "u2", email: "luis@acme.com", role: "admin", status: "Active", password: HASH_LUIS, tenant_id: "t1" },
    { id: "u3", email: "google@acme.com", role: "student", status: "Active", password: null, tenant_id: "t1" },
  ],
});
const passwordDe = (id) => estado.tablas.users.find((u) => u.id === id).password;
const escriturasUsuarios = () => estado.escrituras.filter((e) => e.tabla === "users");

const cadena = [verifyJWT, (req, res) => AuthController.cambiarPassword(req, res)];
const conToken = (user, body) =>
  enSilencio(() =>
    pasarPor(cadena, {
      headers: user ? { authorization: `Bearer ${jwt.sign(user, process.env.JWT_SECRET)}` } : {},
      body,
    })
  );

describe("Cambiar mi contraseña", () => {
  test("S3-20 · HU-071 · con la contraseña actual correcta se cambia la del usuario del token, nunca la de otro id del cuerpo", async () => {
    preparar({ tablas: datos() });
    const res = await conToken(
      { id: "u1", role: "student", tenantId: "t1" },
      { id: "u2", actual: "ClaveActual1", nueva: "ClaveNueva22" }
    );
    assert.equal(res.statusCode, 200);
    assert.match(res.cuerpo.message, /actualizada/);
    assert.ok(await bcrypt.compare("ClaveNueva22", passwordDe("u1")));
    assert.equal(await bcrypt.compare("ClaveActual1", passwordDe("u1")), false, "la vieja deja de servir");
    assert.equal(passwordDe("u2"), HASH_LUIS, "el id del cuerpo se ignora");
    assert.notEqual(passwordDe("u1"), "ClaveNueva22", "se guarda hasheada");

    const sinSesion = await conToken(null, { actual: "ClaveActual1", nueva: "OtraNueva33" });
    assert.equal(sinSesion.statusCode, 401);
  });

  test("S3-21 · HU-071 · si la contraseña actual es incorrecta responde 401 y no cambia nada", async () => {
    preparar({ tablas: datos() });
    const res = await conToken({ id: "u1", role: "student", tenantId: "t1" }, { actual: "NoEsEsta99", nueva: "ClaveNueva22" });
    assert.equal(res.statusCode, 401);
    assert.match(res.cuerpo.message, /actual es incorrecta/);
    assert.equal(passwordDe("u1"), HASH_ANA);
    assert.equal(escriturasUsuarios().length, 0);
  });

  test("S3-22 · HU-071 · faltan datos, la nueva tiene menos de 8 caracteres o es igual a la actual: 400; cuenta de Google/Microsoft: 409", async () => {
    preparar({ tablas: datos() });
    const casos = [
      ["u1", undefined, "ClaveNueva22", 400],
      ["u1", "ClaveActual1", undefined, 400],
      ["u1", "ClaveActual1", "corta", 400],
      ["u1", "ClaveActual1", "ClaveActual1", 400],
      ["u3", "loquesea123", "ClaveNueva22", 409],
      ["no-existe", "ClaveActual1", "ClaveNueva22", 404],
    ];
    for (const [id, actual, nueva, esperado] of casos) {
      const r = await AuthService.cambiarPassword(id, actual, nueva);
      assert.equal(r.estado, esperado, JSON.stringify({ id, actual, nueva }));
    }
    assert.equal(passwordDe("u1"), HASH_ANA);
    assert.equal(passwordDe("u3"), null);
    assert.equal(escriturasUsuarios().length, 0);
  });
});

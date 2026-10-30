// HU-013 · Limitar intentos fallidos de inicio de sesión.
// Se arma la misma cadena que POST /api/auth/localuser (frenarFallos con la
// configuración de routes/authRoutes.js + el controlador de login real).
process.env.JWT_SECRET = "secreto-de-prueba-sprint-3";
require("../soporte/supabaseFalso.js");
const { preparar, pasarPor, enSilencio } = require("./soporte.js");
const { test, describe, mock, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcrypt");
const { frenarFallos, intentos } = require("../../middlewares/intentos.js");
const AuthController = require("../../controllers/authController.js");

// Igual que frenoLogin en routes/authRoutes.js.
const frenoLogin = frenarFallos({
  nombre: "login",
  claves: (req) => [
    { k: (req.body?.email || "").trim().toLowerCase(), gratis: 5 },
    { k: req.ip, gratis: 20 },
  ],
  codigosFallo: [401, 404],
});

let llegaronAlControlador = 0;
const login = (req, res) => { llegaronAlControlador += 1; return AuthController.login(req, res); };

const HASH = bcrypt.hashSync("ClaveBuena123", 4);
const users = ["ana", "beto", "caro", "dani", "eva"].map((n, i) => ({
  id: `u${i}`, email: `${n}@acme.com`, role: "student", status: "Active", password: HASH, tenant_id: "t1",
}));

const intentar = (email, password, ip = "10.0.0.1") =>
  enSilencio(() => pasarPor([frenoLogin, login], { body: { email, password }, ip }));

afterEach(() => { mock.timers.reset(); intentos.clear(); llegaronAlControlador = 0; });

describe("Limitar intentos fallidos de inicio de sesión", () => {
  test("S3-13 · HU-013 · al quinto intento fallido la cuenta se bloquea y el sexto recibe 429 aunque traiga la contraseña correcta", async () => {
    preparar({ tablas: { users } });
    for (let i = 1; i <= 5; i++) {
      const res = await intentar("ana@acme.com", "mala");
      assert.equal(res.statusCode, 401, `intento ${i}`);
    }
    const bloqueado = await intentar("ANA@acme.com ", "ClaveBuena123");
    assert.equal(bloqueado.statusCode, 429);
    assert.ok(!bloqueado.cuerpo.token, "no entrega sesión");
    assert.match(bloqueado.cuerpo.message, /Demasiados intentos fallidos/);
    const espera = Number(bloqueado.cabeceras["Retry-After"]);
    assert.ok(espera > 0 && espera <= 60, `Retry-After=${espera}`);
    assert.equal(llegaronAlControlador, 5, "el sexto ni siquiera llega a comparar la contraseña");
  });

  test("S3-14 · HU-013 · iniciar sesión bien antes del límite reinicia el contador de fallos", async () => {
    preparar({ tablas: { users } });
    for (let i = 0; i < 4; i++) await intentar("beto@acme.com", "mala");
    const ok = await intentar("beto@acme.com", "ClaveBuena123");
    assert.equal(ok.statusCode, 200);
    assert.ok(ok.cuerpo.token);
    assert.equal(intentos.has("login:beto@acme.com"), false);

    for (let i = 1; i <= 4; i++) {
      const res = await intentar("beto@acme.com", "mala");
      assert.equal(res.statusCode, 401, `fallo ${i} después de entrar bien`);
    }
    assert.equal((await intentar("beto@acme.com", "ClaveBuena123")).statusCode, 200);
  });

  test("S3-15 · HU-013 · pasado el minuto de bloqueo se puede volver a intentar y cada fallo nuevo duplica la espera", async () => {
    mock.timers.enable({ apis: ["Date"], now: new Date("2026-10-30T12:00:00Z") });
    preparar({ tablas: { users } });
    for (let i = 0; i < 5; i++) await intentar("caro@acme.com", "mala");
    assert.equal((await intentar("caro@acme.com", "mala")).statusCode, 429);

    mock.timers.tick(61 * 1000);
    const sexto = await intentar("caro@acme.com", "mala");
    assert.equal(sexto.statusCode, 401, "ya no está bloqueada: el intento llega y falla");

    const ahora = await intentar("caro@acme.com", "ClaveBuena123");
    assert.equal(ahora.statusCode, 429);
    assert.ok(Number(ahora.cabeceras["Retry-After"]) > 60, "la segunda espera es de 2 minutos");

    mock.timers.tick(61 * 1000);
    assert.equal((await intentar("caro@acme.com", "ClaveBuena123")).statusCode, 429, "todavía falta un minuto");
    mock.timers.tick(60 * 1000);
    assert.equal((await intentar("caro@acme.com", "ClaveBuena123")).statusCode, 200);
  });

  test("S3-16 · HU-013 · la cuenta bloqueada no frena a sus compañeros de la misma IP, pero 20 fallos desde esa IP sí la frenan", async () => {
    preparar({ tablas: { users } });
    for (let i = 0; i < 5; i++) await intentar("dani@acme.com", "mala", "200.1.1.1");
    assert.equal((await intentar("dani@acme.com", "ClaveBuena123", "200.1.1.1")).statusCode, 429);
    assert.equal((await intentar("eva@acme.com", "ClaveBuena123", "200.1.1.1")).statusCode, 200);

    // Alguien probando correos distintos desde una sola IP (404 también cuenta).
    for (let i = 0; i < 20; i++) {
      const r = await intentar(`falso${i}@acme.com`, "x", "66.6.6.6");
      assert.equal(r.statusCode, 404);
    }
    assert.equal((await intentar("eva@acme.com", "ClaveBuena123", "66.6.6.6")).statusCode, 429);
    assert.equal((await intentar("eva@acme.com", "ClaveBuena123", "10.9.9.9")).statusCode, 200, "desde otra IP entra");
  });
});

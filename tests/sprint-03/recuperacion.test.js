// HU-010 · Recuperar contraseña olvidada: pedir el enlace y canjear el token.
// El mailer está reemplazado (ver soporte.js): ningún correo sale de verdad.
process.env.JWT_SECRET = "secreto-de-prueba-sprint-3";
process.env.MAIL_PROVIDER = "consola";
require("../soporte/supabaseFalso.js");
const { preparar, estado, correos, respuesta, enSilencio } = require("./soporte.js");
const { test, describe, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const bcrypt = require("bcrypt");
const PasswordResetService = require("../../services/passwordResetService.js");
const AuthController = require("../../controllers/authController.js");

const sha = (t) => crypto.createHash("sha256").update(t).digest("hex");
const HASH_VIEJO = bcrypt.hashSync("ClaveVieja123", 4);
const GENERICO = "Si el correo está registrado, te enviamos un enlace para restablecer la contraseña.";
const enUnRato = (min) => new Date(Date.now() + min * 60 * 1000).toISOString();

const usuarios = () => [
  { id: "u1", email: "ana@acme.com", firstname: "Ana", role: "student", status: "Active", password: HASH_VIEJO, tenant_id: "t1" },
  { id: "u2", email: "google@acme.com", firstname: "Gus", role: "student", status: "Active", password: null, tenant_id: "t1" },
  { id: "u3", email: "baja@acme.com", firstname: "Bea", role: "student", status: "Inactive", password: HASH_VIEJO, tenant_id: "t1" },
];

const passwordDe = (id) => estado.tablas.users.find((u) => u.id === id).password;

beforeEach(() => { correos.length = 0; });

describe("Recuperar contraseña olvidada", () => {
  test("S3-09 · HU-010 · con un correo registrado se envía un enlace de un solo uso que vence en 60 minutos y en la base queda solo su hash", async () => {
    preparar({ tablas: { users: usuarios(), password_resets: [] } });
    const r = await enSilencio(() => PasswordResetService.solicitar("  ANA@acme.com "));
    assert.equal(r.estado, 200);
    assert.equal(r.message, GENERICO);

    assert.equal(correos.length, 1);
    assert.equal(correos[0].para, "ana@acme.com");
    const token = correos[0].texto.match(/reset-password\?token=([0-9a-f]+)/)[1];
    assert.equal(token.length, 64);
    assert.ok(correos[0].texto.includes("http://front.prueba/reset-password?token="));

    const [fila] = estado.tablas.password_resets;
    assert.equal(fila.user_id, "u1");
    assert.equal(fila.token_hash, sha(token));
    assert.ok(!JSON.stringify(fila).includes(token), "el token en claro no se guarda");
    const minutos = (new Date(fila.expires_at) - Date.now()) / 60000;
    assert.ok(minutos > 59 && minutos <= 60, `vence en ${minutos} min`);
  });

  test("S3-10 · HU-010 · un correo inexistente, de una cuenta Google/Microsoft o inactiva recibe la misma respuesta y no se envía nada", async () => {
    preparar({ tablas: { users: usuarios(), password_resets: [] } });
    for (const email of ["nadie@acme.com", "google@acme.com", "baja@acme.com", "", null]) {
      const res = respuesta();
      await enSilencio(() => AuthController.olvidePassword({ body: { email } }, res));
      assert.equal(res.statusCode, 200, String(email));
      assert.deepEqual(res.cuerpo, { message: GENERICO });
    }
    assert.equal(correos.length, 0);
    assert.equal(estado.tablas.password_resets.length, 0);
  });

  test("S3-11 · HU-010 · el token válido cambia la contraseña, invalida los otros enlaces pendientes y no se puede reutilizar", async () => {
    preparar({
      tablas: {
        users: usuarios(),
        password_resets: [
          { id: "r1", user_id: "u1", token_hash: sha("token-bueno"), expires_at: enUnRato(30), used_at: null },
          { id: "r2", user_id: "u1", token_hash: sha("token-anterior"), expires_at: enUnRato(50), used_at: null },
        ],
      },
    });

    const res = respuesta();
    await AuthController.restablecerPassword({ body: { token: "token-bueno", nueva: "ClaveNueva456" } }, res);
    assert.equal(res.statusCode, 200);
    assert.ok(await bcrypt.compare("ClaveNueva456", passwordDe("u1")));
    assert.equal(await bcrypt.compare("ClaveVieja123", passwordDe("u1")), false);
    assert.ok(estado.tablas.password_resets.every((r) => r.used_at), "ambos enlaces quedan usados");

    const otraVez = await PasswordResetService.restablecer("token-bueno", "OtraClave789");
    assert.equal(otraVez.estado, 400);
    assert.match(otraVez.message, /no es válido o ya fue utilizado/);
    const anterior = await PasswordResetService.restablecer("token-anterior", "OtraClave789");
    assert.equal(anterior.estado, 400);
    const inventado = await PasswordResetService.restablecer("token-inventado", "OtraClave789");
    assert.equal(inventado.estado, 400);
    assert.ok(await bcrypt.compare("ClaveNueva456", passwordDe("u1")), "sigue la contraseña del primer canje");
  });

  test("S3-12 · HU-010 · un token vencido o una contraseña nueva de menos de 8 caracteres responden 400 y no cambian nada", async () => {
    preparar({
      tablas: {
        users: usuarios(),
        password_resets: [
          { id: "r1", user_id: "u1", token_hash: sha("vencido"), expires_at: enUnRato(-1), used_at: null },
          { id: "r2", user_id: "u1", token_hash: sha("vigente"), expires_at: enUnRato(30), used_at: null },
        ],
      },
    });

    const vencido = await PasswordResetService.restablecer("vencido", "ClaveNueva456");
    assert.equal(vencido.estado, 400);
    assert.match(vencido.message, /venció/);

    const corta = await PasswordResetService.restablecer("vigente", "corta");
    assert.equal(corta.estado, 400);
    const sinToken = await PasswordResetService.restablecer("", "ClaveNueva456");
    assert.equal(sinToken.estado, 400);

    assert.equal(passwordDe("u1"), HASH_VIEJO);
    assert.ok(estado.tablas.password_resets.every((r) => r.used_at === null), "ningún enlace se consumió");
  });
});

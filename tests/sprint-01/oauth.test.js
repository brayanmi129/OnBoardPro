// Sprint 1: inicio de sesión con Google (HU-008) y con Microsoft (HU-009).
// No se habla con Google ni con Microsoft: passport ya entregó el perfil y lo
// que se prueba es la lógica propia (qué correo se acepta, cómo se busca o
// crea la cuenta y qué token se emite). El perfil se arma a mano.
process.env.JWT_SECRET = "secreto-de-pruebas";
process.env.URL_FRONT = "https://front.test";
const { preparar, estado, respuesta, silenciarConsola } = require("./soporte.js");
const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const AuthService = require("../../services/authService.js");
const AuthController = require("../../controllers/authController.js");

silenciarConsola();

const tablas = () => ({
  tenants: [
    { id: "t-emp", name: "Empresa SA", domain: "empresa.com", active: true },
    { id: "t-baja", name: "Dada de baja", domain: "baja.com", active: false },
  ],
  users: [{ id: "u-jefa", email: "jefa@empresa.com", password: null, firstname: "Marta", role: "admin", tenant_id: "t-emp" }],
});

const google = (email, extra = {}) => ({
  emails: [{ value: email, verified: true, ...extra }],
  name: { givenName: "Pedro", familyName: "Ruiz" },
});
const microsoft = (json) => ({ _json: { givenName: "Sara", surname: "López", ...json } });
const usuariosCreados = () => estado.escrituras.filter((e) => e.tabla === "users" && e.operacion === "insert");

describe("Iniciar sesión con Google", () => {
  test("S1-12 · HU-008 · un correo nuevo de un dominio registrado crea la cuenta como aprendiz de esa empresa; una existente entra con su rol sin duplicarse", async () => {
    preparar({ tablas: tablas() });
    const r = await AuthService.OAuthGoogle(google("pedro@empresa.com"));
    assert.equal(usuariosCreados().length, 1);
    const fila = usuariosCreados()[0].valores;
    assert.equal(fila.tenant_id, "t-emp");
    assert.equal(fila.role, "student");
    assert.equal(fila.firstname, "Pedro");
    assert.equal(fila.lastname, "Ruiz");
    const pago = jwt.verify(r.token, process.env.JWT_SECRET);
    assert.equal(pago.email, "pedro@empresa.com");
    assert.equal(pago.tenantId, "t-emp");
    assert.equal(pago.role, "student");

    const existente = await AuthService.OAuthGoogle(google("jefa@empresa.com"));
    assert.equal(usuariosCreados().length, 1);
    assert.equal(existente.userData.id, "u-jefa");
    assert.equal(jwt.decode(existente.token).role, "admin");
    assert.equal("password" in existente.userData, false);
  });

  test("S1-13 · HU-008 · se rechaza un correo que Google no verificó, de un dominio no registrado o un perfil sin correo, sin crear cuentas", async () => {
    preparar({ tablas: tablas() });
    const noVerificado = await AuthService.OAuthGoogle(google("intruso@empresa.com", { verified: false }));
    assert.match(noVerificado.error, /verificado/);
    const ajeno = await AuthService.OAuthGoogle(google("alguien@gmail.com"));
    assert.match(ajeno.error, /no registrado/);
    const sinCorreo = await AuthService.OAuthGoogle({ emails: [] });
    assert.equal(sinCorreo, null);
    assert.equal(usuariosCreados().length, 0);
  });

  test("S1-14 · HU-008 · el callback redirige al front con el token o con token=Fail y el motivo", async () => {
    preparar({ tablas: tablas() });
    let res = respuesta();
    await AuthController.google({ user: google("jefa@empresa.com") }, res);
    assert.ok(res.redirigidoA.startsWith("https://front.test/?token="));
    const token = new URL(res.redirigidoA).searchParams.get("token");
    assert.equal(jwt.verify(token, process.env.JWT_SECRET).id, "u-jefa");

    res = respuesta();
    await AuthController.google({ user: google("alguien@gmail.com") }, res);
    const url = new URL(res.redirigidoA);
    assert.equal(url.searchParams.get("token"), "Fail");
    assert.equal(url.searchParams.get("reason"), "Dominio no registrado en la plataforma.");
  });
});

describe("Iniciar sesión con Microsoft", () => {
  test("S1-15 · HU-009 · se usa el userPrincipalName en minúsculas: encuentra la cuenta existente o crea una nueva con los nombres del directorio", async () => {
    preparar({ tablas: tablas() });
    const r = await AuthService.OAuthMicrosoft(microsoft({ userPrincipalName: "  Jefa@Empresa.COM " }));
    assert.equal(usuariosCreados().length, 0);
    assert.equal(r.userData.id, "u-jefa");
    assert.equal(jwt.decode(r.token).role, "admin");

    const res = respuesta();
    await AuthController.microsoft({ user: microsoft({ userPrincipalName: "sara@empresa.com" }) }, res);
    const fila = usuariosCreados()[0].valores;
    assert.equal(fila.email, "sara@empresa.com");
    assert.equal(fila.firstname, "Sara");
    assert.equal(fila.lastname, "López");
    assert.equal(fila.tenant_id, "t-emp");
    const token = new URL(res.redirigidoA).searchParams.get("token");
    assert.equal(jwt.verify(token, process.env.JWT_SECRET).email, "sara@empresa.com");
  });

  test("S1-16 · HU-009 · se ignora el campo mail (nOAuth) y se rechazan invitados #EXT# y empresas desactivadas", async () => {
    preparar({ tablas: tablas() });
    const suplantacion = await AuthService.OAuthMicrosoft(
      microsoft({ mail: "jefa@empresa.com", userPrincipalName: "atacante@otrodirectorio.onmicrosoft.com" })
    );
    assert.match(suplantacion.error, /no registrado/);
    assert.equal(suplantacion.token, undefined);

    const sinUpn = await AuthService.OAuthMicrosoft(microsoft({ mail: "jefa@empresa.com" }));
    assert.match(sinUpn.error, /organización registrada/);

    const invitado = await AuthService.OAuthMicrosoft(microsoft({ userPrincipalName: "x_empresa.com#EXT#@empresa.com" }));
    assert.match(invitado.error, /organización registrada/);

    const baja = await AuthService.OAuthMicrosoft(microsoft({ userPrincipalName: "sara@baja.com" }));
    assert.match(baja.error, /no registrado/);
    assert.equal(usuariosCreados().length, 0);
  });

  test(
    "S1-17 · HU-009 · una cuenta nueva cuyo perfil no trae nombre igual puede entrar",
    { todo: "posible bug: services/authService.js:127 (y :84 para Google) completan el nombre faltante con \"\", pero schemas/userSchemas.js:8 exige firstname de al menos 1 carácter; _createOAuthUser (services/userService.js:79) lanza y el primer login de esa persona termina en token=Fail" },
    async () => {
      preparar({ tablas: tablas() });
      const r = await AuthService.OAuthMicrosoft({ _json: { userPrincipalName: "servicio@empresa.com" } });
      assert.ok(r?.token, "debía entregar token");
      assert.equal(usuariosCreados().length, 1);
    }
  );
});

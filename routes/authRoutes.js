const express = require("express");
const passport = require("passport");
const router = express.Router();
const AuthController = require("../controllers/authController.js");
const verifyJWT = require("../middlewares/jwt.js");
const { frenarFallos } = require("../middlewares/intentos.js");

// A dónde se devuelve al usuario si el proveedor rechaza la autenticación.
// El token viaja en la query (?token=) porque es lo que espera el frontend
// Angular. Pendiente: pasarlo a un código de un solo uso para que deje de
// quedar registrado en los logs de Render, Vercel y Cloudflare.
const FRONT = process.env.URL_FRONT || "http://localhost:5173";
const FALLO_GOOGLE = `${FRONT}/?token=Fail&reason=${encodeURIComponent("No se pudo autenticar con Google.")}`;
const FALLO_MICROSOFT = `${FRONT}/?token=Fail&reason=${encodeURIComponent("No se pudo autenticar con Microsoft.")}`;

// HU-013: 5 intentos fallidos y después hay que esperar, cada vez más.
const frenoLogin = frenarFallos({
  nombre: "login",
  claves: (req) => [
    { k: (req.body?.email || "").trim().toLowerCase(), gratis: 5 },
    { k: req.ip, gratis: 20 }, // margen ancho: una empresa entera comparte IP
  ],
  codigosFallo: [401, 404], // contraseña incorrecta y usuario inexistente
});

// El mismo freno donde también se adivina una contraseña.
const frenoCambio = frenarFallos({
  nombre: "cambio",
  claves: (req) => [
    { k: req.user?.id, gratis: 5 },
    { k: req.ip, gratis: 20 },
  ],
  codigosFallo: [401],
});

/**
 * @swagger
 * tags:
 *   name: Autenticación
 *   description: Endpoints para autenticación local y con proveedores externos (Google y Microsoft)
 */

/**
 * @swagger
 * /api/auth/localuser:
 *   post:
 *     summary: Inicia sesión con correo y contraseña
 *     tags: [Autenticación]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 example: ejemplo@correo.com
 *               password:
 *                 type: string
 *                 example: 123456
 *     responses:
 *       200:
 *         description: Usuario autenticado correctamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 token:
 *                   type: string
 *                   example: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
 *                 user:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       example: a1b2c3
 *                     email:
 *                       type: string
 *                       example: ejemplo@correo.com
 *                     rol:
 *                       type: string
 *                       example: Aprendiz
 *       401:
 *         description: Credenciales inválidas o usuario no encontrado
 */
router.post("/localuser", frenoLogin, (req, res) => AuthController.login(req, res));

/**
 * @swagger
 * /api/auth/google:
 *   get:
 *     summary: Redirige al flujo de autenticación con Google
 *     tags: [Autenticación]
 *     description: Inicia el proceso de autenticación OAuth2 con Google. Redirige al usuario a la página de Google para seleccionar su cuenta.
 *     responses:
 *       302:
 *         description: Redirección hacia la página de inicio de sesión de Google
 */
router.get(
  "/google",
  passport.authenticate("google", {
    scope: ["profile", "email"],
    prompt: "select_account",
  })
);

/**
 * @swagger
 * /api/auth/google/callback:
 *   get:
 *     summary: Callback de autenticación con Google
 *     tags: [Autenticación]
 *     description: Endpoint al que Google redirige después de la autenticación. Devuelve un token JWT como parámetro en la URL del frontend.
 *     parameters:
 *       - in: query
 *         name: code
 *         required: false
 *         schema:
 *           type: string
 *         description: Código temporal proporcionado por Google OAuth2
 *     responses:
 *       302:
 *         description: Redirección al frontend con el token del usuario
 *         headers:
 *           Location:
 *             description: URL del frontend con el token (por ejemplo, `https://frontend.com/?token=abc123`)
 *             schema:
 *               type: string
 *       401:
 *         description: Fallo en la autenticación con Google
 */
router.get(
  "/google/callback",
  passport.authenticate("google", { failureRedirect: FALLO_GOOGLE, session: false }),
  (req, res) => AuthController.google(req, res)
);

/**
 * @swagger
 * /api/auth/microsoft:
 *   get:
 *     summary: Redirige al flujo de autenticación con Microsoft
 *     tags: [Autenticación]
 *     description: Inicia el proceso de autenticación OAuth2 con Microsoft. Redirige al usuario a la página de inicio de sesión de Microsoft.
 *     responses:
 *       302:
 *         description: Redirección hacia la página de inicio de sesión de Microsoft
 */
router.get(
  "/microsoft",
  passport.authenticate("microsoft", {
    scope: ["user.read"],
    prompt: "select_account",
  })
);

/**
 * @swagger
 * /api/auth/microsoft/callback:
 *   get:
 *     summary: Callback de autenticación con Microsoft
 *     tags: [Autenticación]
 *     description: Endpoint al que Microsoft redirige después de la autenticación. Devuelve un token JWT como parámetro en la URL del frontend.
 *     parameters:
 *       - in: query
 *         name: code
 *         required: false
 *         schema:
 *           type: string
 *         description: Código temporal proporcionado por Microsoft OAuth2
 *     responses:
 *       302:
 *         description: Redirección al frontend con el token del usuario
 *         headers:
 *           Location:
 *             description: URL del frontend con el token (por ejemplo, `https://frontend.com/?token=abc123`)
 *             schema:
 *               type: string
 *       401:
 *         description: Fallo en la autenticación con Microsoft
 */
router.get(
  "/microsoft/callback",
  passport.authenticate("microsoft", { session: false, failureRedirect: FALLO_MICROSOFT }),
  (req, res) => AuthController.microsoft(req, res)
);

/**
 * @swagger
 * /api/auth/me:
 *   get:
 *     summary: Obtiene la información del usuario autenticado
 *     tags: [Autenticación]
 *     description: >
 *       Devuelve los datos del usuario autenticado usando su token JWT.
 *       Usa el botón **Authorize** de Swagger e ingresa el token con el prefijo `Bearer`.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Información del usuario autenticado
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                   example: "abc123"
 *                 email:
 *                   type: string
 *                   example: "usuario@correo.com"
 *                 rol:
 *                   type: string
 *                   example: "Instructor"
 *       401:
 *         description: Token inválido o no autenticado
 */
router.get("/me", verifyJWT, AuthController.me);

/**
 * @swagger
 * /api/auth/change-password:
 *   post:
 *     summary: Cambia la contraseña del usuario autenticado
 *     tags: [Autenticación]
 *     description: >
 *       Exige el JWT y la contraseña actual. El usuario que se modifica es
 *       siempre el del token: no se puede cambiar la contraseña de otra persona.
 *       Las cuentas creadas con Google o Microsoft no tienen contraseña y
 *       reciben 409.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [actual, nueva]
 *             properties:
 *               actual:
 *                 type: string
 *                 example: "MiClaveVieja123"
 *               nueva:
 *                 type: string
 *                 minLength: 8
 *                 example: "MiClaveNueva456"
 *     responses:
 *       200:
 *         description: Contraseña actualizada correctamente
 *       400:
 *         description: Faltan datos, la nueva es muy corta o es igual a la actual
 *       401:
 *         description: Token inválido, o la contraseña actual no coincide
 *       409:
 *         description: La cuenta no tiene contraseña (inicia sesión con un proveedor externo)
 */
router.post("/change-password", verifyJWT, frenoCambio, (req, res) =>
  AuthController.cambiarPassword(req, res)
);

/**
 * @swagger
 * /api/auth/forgot-password:
 *   post:
 *     summary: Pide un enlace para restablecer la contraseña
 *     tags: [Autenticación]
 *     description: >
 *       No requiere autenticación. Responde **siempre 200** con el mismo mensaje,
 *       exista o no el correo: distinguirlos permitiría averiguar quién tiene
 *       cuenta en la plataforma. Las cuentas de Google o Microsoft no reciben
 *       enlace porque no tienen contraseña, pero la respuesta es idéntica.
 *       El enlace apunta al frontend y vence en 60 minutos.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email:
 *                 type: string
 *                 example: "a.garcia@ucentral.edu.co"
 *     responses:
 *       200:
 *         description: Respuesta genérica, se haya enviado o no el correo
 */
router.post("/forgot-password", (req, res) => AuthController.olvidePassword(req, res));

/**
 * @swagger
 * /api/auth/reset-password:
 *   post:
 *     summary: Restablece la contraseña con el token del correo
 *     tags: [Autenticación]
 *     description: >
 *       No requiere autenticación: el token del correo es la prueba de identidad.
 *       Sirve una sola vez y vence a los 60 minutos. Al usarlo se invalidan los
 *       demás enlaces pendientes de esa persona.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [token, nueva]
 *             properties:
 *               token:
 *                 type: string
 *                 example: "a3f9c1..."
 *               nueva:
 *                 type: string
 *                 minLength: 8
 *                 example: "MiClaveNueva456"
 *     responses:
 *       200:
 *         description: Contraseña restablecida
 *       400:
 *         description: Token inválido, ya usado, vencido, o contraseña muy corta
 */
router.post("/reset-password", (req, res) => AuthController.restablecerPassword(req, res));

module.exports = router;

const express = require("express");
const passport = require("passport");
const router = express.Router();
const AuthController = require("../controllers/authController.js");
const verifyJWT = require("../middlewares/jwt.js");
const { Auth } = require("googleapis");

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
router.post("/localuser", (req, res) => AuthController.login(req, res));

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
  passport.authenticate("google", { scope: ["profile", "email"], prompt: "select_account" })
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
  passport.authenticate("google", {
    failureRedirect: `${process.env.URL_FRONT}/?token=Fail`,
    session: false,
  }),
  (req, res) => AuthController.oauthCallback(req, res)
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
  passport.authenticate("microsoft", { scope: ["user.read"], prompt: "select_account" })
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
  passport.authenticate("microsoft", {
    session: false,
    failureRedirect: `${process.env.URL_FRONT}/?token=Fail`,
  }),
  (req, res) => AuthController.oauthCallback(req, res)
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

module.exports = router;

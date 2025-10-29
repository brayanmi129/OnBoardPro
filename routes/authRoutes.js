const express = require("express");
const passport = require("passport");
const router = express.Router();
const AuthService = require("../services/authService.js");

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
router.post("/localuser", AuthService.local);

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
 *     summary: Callback de Google OAuth
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
  (req, res) => {
    const user = req.user;
    if (!user) return res.redirect(`${process.env.URL_FRONT}/?token=fail`);
    res.redirect(`${process.env.URL_FRONT}/?token=${user.token}`);
  }
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
 *     summary: Callback de Microsoft OAuth
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
  (req, res) => {
    const user = req.user;
    if (!user) return res.redirect(`${process.env.URL_FRONT}/?token=fail`);
    res.redirect(`${process.env.URL_FRONT}/?token=${user.token}`);
  }
);

/**
 * @swagger
 * /api/auth/cookie:
 *   get:
 *     summary: Verifica si el usuario está autenticado mediante cookie de sesión
 *     tags: [Autenticación]
 *     responses:
 *       200:
 *         description: Devuelve los datos del usuario autenticado
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
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
 *                       example: Instructor
 *       401:
 *         description: No hay una sesión activa o el usuario no está autenticado
 */
router.get("/cookie", (req, res) => {
  if (req.isAuthenticated()) {
    res.json({ user: req.user });
  } else {
    res.status(401).send("No autenticado");
  }
});

module.exports = router;

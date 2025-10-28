const express = require("express");
const passport = require("passport");
const router = express.Router();
const AuthService = require("../services/authService.js");

/**
 * @swagger
 * tags:
 *   name: Autenticación
 *   description: Endpoints de login normal y Google OAuth
 */

/**
 * @swagger
 * /api/auth/localuser:
 *   post:
 *     summary: Inicia sesión con usuario y contraseña
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
 *       401:
 *         description: Credenciales inválidas
 */
router.post("/localuser", AuthService.local);

router.get(
  "/google",
  passport.authenticate("google", {
    scope: ["profile", "email"],
    prompt: "select_account",
  })
);

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

router.get(
  "/microsoft",
  passport.authenticate("microsoft", {
    scope: ["user.read"],
    prompt: "select_account",
  })
);

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
 *     summary: Verifica si el usuario está autenticado en la sesión
 *     tags: [Autenticación]
 *     responses:
 *       200:
 *         description: Devuelve los datos del usuario si está autenticado
 *       401:
 *         description: Usuario no autenticado
 */
router.get("/cookie", (req, res) => {
  if (req.isAuthenticated()) {
    res.json({ user: req.user });
  } else {
    res.status(401).send("No autenticado");
  }
});

module.exports = router;

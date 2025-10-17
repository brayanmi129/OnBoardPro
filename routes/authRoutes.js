const express = require("express");
const passport = require("passport");
const router = express.Router();
const AuthController = require("../controllers/authcontroller.js");

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
router.post("/localuser", AuthController.AuthUserByNormalMethod);

/**
 * @swagger
 * /api/auth/google:
 *   get:
 *     summary: Redirige al login de Google
 *     tags: [Autenticación]
 *     responses:
 *       302:
 *         description: Redirige al login de Google
 */
router.get("/google", passport.authenticate("google", { scope: ["profile", "email"] }));

/**
 * @swagger
 * /api/auth/google/callback:
 *   get:
 *     summary: Callback de Google OAuth
 *     tags: [Autenticación]
 *     responses:
 *       200:
 *         description: Usuario autenticado correctamente mediante Google
 *       401:
 *         description: Error de autenticación
 */
router.get(
  "/google/callback",
  passport.authenticate("google", { failureRedirect: "/" }),
  (req, res) => {
    if (!req.user) {
      return res.status(401).json({ message: "Error de autenticación. Intenta de nuevo." });
    }
    res.status(200).json({ message: "Usuario autenticado con Google", user: req.user });
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

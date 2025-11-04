const express = require("express");
const passport = require("passport");
const router = express.Router();
const AuthController = require("../controllers/authController.js");

// 🔹 Autenticación local
router.post("/localuser", (req, res) => AuthController.login(req, res));

// 🔹 Google OAuth
router.get(
  "/google",
  passport.authenticate("google", { scope: ["profile", "email"], prompt: "select_account" })
);

router.get(
  "/google/callback",
  passport.authenticate("google", {
    failureRedirect: `${process.env.URL_FRONT}/?token=Fail`,
    session: false,
  }),
  (req, res) => AuthController.oauthCallback(req, res)
);

// 🔹 Microsoft OAuth
router.get(
  "/microsoft",
  passport.authenticate("microsoft", { scope: ["user.read"], prompt: "select_account" })
);

router.get(
  "/microsoft/callback",
  passport.authenticate("microsoft", {
    session: false,
    failureRedirect: `${process.env.URL_FRONT}/?token=Fail`,
  }),
  (req, res) => AuthController.oauthCallback(req, res)
);

// 🔹 Verificar sesión por cookie
router.get("/cookie", (req, res) => AuthController.checkSession(req, res));

module.exports = router;

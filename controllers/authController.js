const AuthService = require("../services/authService.js");

class AuthController {
  /**
   * Controlador para autenticación local (email y contraseña)
   */
  async login(req, res) {
    try {
      // El servicio maneja la lógica y devuelve la respuesta
      await AuthService.local(req, res);
    } catch (error) {
      console.error("Error en AuthController.login:", error);
      res.status(500).send("Error del servidor al iniciar sesión.");
    }
  }

  /**
   * Controlador para autenticación OAuth (Google, Microsoft, etc.)
   */
  async oauthCallback(req, res) {
    try {
      const profile = req.user; // Passport guarda el perfil autenticado aquí
      const result = await AuthService.OAuth(profile);

      if (!result) {
        return res.redirect(`${process.env.URL_FRONT}/?token=Fail`);
      }

      // Redirigir al frontend con el token
      res.redirect(`${process.env.URL_FRONT}/?token=${result.token}`);
    } catch (error) {
      console.error("Error en AuthController.oauthCallback:", error);
      res.redirect(`${process.env.URL_FRONT}/?token=Fail`);
    }
  }

  /**
   * Verifica si el usuario tiene una sesión activa (cookie)
   */
  async checkSession(req, res) {
    try {
      if (req.isAuthenticated()) {
        return res.json({ user: req.user });
      }
      res.status(401).send("No autenticado");
    } catch (error) {
      console.error("Error en AuthController.checkSession:", error);
      res.status(500).send("Error del servidor.");
    }
  }
}

module.exports = new AuthController();

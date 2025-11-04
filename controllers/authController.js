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

  async me(req, res) {
    // Verificar si el token fue decodificado correctamente
    if (!req.user) {
      console.warn("Token ausente o inválido.");
      return res.status(401).json({
        message: "Acceso no autorizado. Token inválido o ausente.",
      });
    }

    try {
      const id = req.user.id;
      console.log("ID del usuario autenticado:", id);

      const user = await AuthService.me(id);

      if (!user) {
        return res.status(404).json({
          message: "Usuario no encontrado o no registrado en el sistema.",
        });
      }

      return res.status(200).json({
        message: "Usuario autenticado correctamente.",
        user,
      });
    } catch (error) {
      console.error("Error en AuthController.me:", error);
      return res.status(500).json({
        message: "Error interno del servidor al obtener la información del usuario.",
      });
    }
  }
}

module.exports = new AuthController();

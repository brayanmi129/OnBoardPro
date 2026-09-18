const AuthService = require("../services/authService.js");
const PasswordResetService = require("../services/passwordResetService.js");

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
  async google(req, res) {
    try {
      const profile = req.user;
      const result = await AuthService.OAuthGoogle(profile);

      if (!result || result.error || !result.token) {
        const reason = result?.error ? encodeURIComponent(result.error) : "Fail";
        return res.redirect(`${process.env.URL_FRONT}/?token=Fail&reason=${reason}`);
      }

      return res.redirect(`${process.env.URL_FRONT}/?token=${result.token}`);
    } catch (err) {
      console.error(err);
      return res.redirect(`${process.env.URL_FRONT}/?token=Fail`);
    }
  }

  async microsoft(req, res) {
    try {
      const profile = req.user;
      const result = await AuthService.OAuthMicrosoft(profile);

      if (!result || result.error || !result.token) {
        const reason = result?.error ? encodeURIComponent(result.error) : "Fail";
        return res.redirect(`${process.env.URL_FRONT}/?token=Fail&reason=${reason}`);
      }

      return res.redirect(`${process.env.URL_FRONT}/?token=${result.token}`);
    } catch (err) {
      console.error(err);
      return res.redirect(`${process.env.URL_FRONT}/?token=Fail`);
    }
  }

  /**
   * Paso 1 de la recuperación (HU-010): pedir el enlace.
   * Responde siempre 200 para no revelar qué correos existen.
   */
  async olvidePassword(req, res) {
    try {
      const { email } = req.body || {};
      const r = await PasswordResetService.solicitar(email);
      return res.status(r.estado).json({ message: r.message });
    } catch (error) {
      console.error("Error en AuthController.olvidePassword:", error);
      return res.status(500).json({ message: "Error interno del servidor." });
    }
  }

  /**
   * Paso 2 de la recuperación (HU-010): canjear el token por una contraseña nueva.
   */
  async restablecerPassword(req, res) {
    try {
      const { token, nueva } = req.body || {};
      const r = await PasswordResetService.restablecer(token, nueva);
      return res.status(r.estado).json({ message: r.message });
    } catch (error) {
      console.error("Error en AuthController.restablecerPassword:", error);
      return res.status(500).json({ message: "Error interno del servidor." });
    }
  }

  /**
   * Cambio de contraseña del propio usuario autenticado (HU-071).
   * El id sale del JWT, nunca del body: si viniera del body cualquiera podría
   * cambiarle la contraseña a otro.
   */
  async cambiarPassword(req, res) {
    try {
      const { actual, nueva } = req.body || {};
      const r = await AuthService.cambiarPassword(req.user.id, actual, nueva);
      return res.status(r.estado).json({ message: r.message });
    } catch (error) {
      console.error("Error en AuthController.cambiarPassword:", error);
      return res.status(500).json({ message: "Error interno del servidor." });
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
      console.log(req.user);
      const id = req.user.id;
      console.log("ID del usuario autenticado:", id);

      const userData = await AuthService.me(id);

      if (!userData) {
        return res.status(404).json({
          message: "Usuario no encontrado o no registrado en el sistema.",
        });
      }

      return res.status(200).json({
        message: "Usuario autenticado correctamente.",
        userData,
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

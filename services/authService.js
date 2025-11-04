const { db } = require("../helpers/firebaseHelper.js");
const UserService = require("./userService.js");
const jwt = require("jsonwebtoken");

class AuthService {
  /**
   * Autenticación local (email y contraseña)
   */
  async local(req, res) {
    const { email, password } = req.body;

    try {
      if (!email || !password) {
        return res.status(400).send("Debe ingresar un email y una contraseña.");
      }

      // Buscar el usuario por email
      const snapshot = await db.collection("users").where("email", "==", email).get();
      if (snapshot.empty) {
        return res.status(404).send("No existe usuario con ese email.");
      }

      // Obtener el primer documento encontrado
      const userDoc = snapshot.docs[0];
      const userData = { id: userDoc.id, ...userDoc.data() };

      // Verificar contraseña (⚠️ idealmente usar hash)
      if (userData.password !== password) {
        console.log("Contraseña incorrecta para:", email);
        return res.status(401).send("Contraseña incorrecta.");
      }

      console.log("Usuario autenticado:", userData.email);

      // Obtener información del servicio de usuarios
      const user = await UserService.getByEmail(userData.email);

      // Generar token
      const token = jwt.sign({ id: userData.id }, process.env.JWT_SECRET, {
        expiresIn: "3h",
      });

      // Devolver el mismo formato que OAuth
      return res.json({ ...user, token });
    } catch (error) {
      console.error("Error durante la autenticación local:", error);
      return res.status(500).send("Error del servidor.");
    }
  }

  /**
   * Autenticación con OAuth (Google, Facebook, etc.)
   */
  async OAuth(profile) {
    try {
      console.log("Callback de autenticación OAuth");

      const email = profile?.emails?.[0]?.value;
      if (!email) throw new Error("No se encontró el email en el perfil.");

      const user = await UserService.getByEmail(email);
      if (!user) {
        console.log("Usuario no registrado:", email);
        return null;
      }

      // Generar token
      const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, {
        expiresIn: "3h",
      });

      // Devolver el mismo formato que local
      return { ...user, token };
    } catch (error) {
      console.error("Error en autenticación OAuth:", error);
      return null;
    }
  }
}

module.exports = new AuthService();

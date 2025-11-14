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

      // Generar token
      const token = jwt.sign({ id: userData.id }, process.env.JWT_SECRET, {
        expiresIn: "3h",
      });

      // Devolver el mismo formato que OAuth
      return res.json({ userData, token });
    } catch (error) {
      console.error("Error durante la autenticación local:", error);
      return res.status(500).send("Error del servidor.");
    }
  }

  /**
   * Autenticación con OAuth (Google, Facebook, etc.)
   */
  async OAuthGoogle(profile) {
    console.log(profile.emails);
    try {
      console.log("Callback de autenticación OAuth");

      const email = profile?.emails?.[0]?.value;
      console.log(email);
      if (!email) throw new Error("No se encontró el email en el perfil.");

      const userData = await UserService.getByEmail(email);
      if (!userData) {
        console.log("Usuario no registrado:", email);
        return null;
      }
      console.log(userData);
      // Generar token
      const token = jwt.sign({ id: userData[0].id }, process.env.JWT_SECRET, {
        expiresIn: "3h",
      });

      // Devolver el mismo formato que local
      return { ...userData, token };
    } catch (error) {
      console.error("Error en autenticación OAuth:", error);
      return null;
    }
  }

  async OAuthMicrosoft(profile) {
    console.log(profile.emails);
    try {
      console.log("Callback de autenticación OAuth");

      const email = profile._json.mail.value || profile._json.userPrincipalName;
      console.log(email);
      if (!email) throw new Error("No se encontró el email en el perfil.");

      const userData = await UserService.getByEmail(email);
      if (!userData) {
        console.log("Usuario no registrado:", email);
        return null;
      }

      // Generar token
      const token = jwt.sign({ id: userData.id }, process.env.JWT_SECRET, {
        expiresIn: "3h",
      });

      // Devolver el mismo formato que local
      return { ...userData, token };
    } catch (error) {
      console.error("Error en autenticación OAuth:", error);
      return null;
    }
  }

  async me(id) {
    console.log("Me:", id);

    try {
      // Buscar usuario por ID
      const userinfo = await UserService.getById(id);
      console.log("Userinfo obtenido:", userinfo);

      // Si no hay resultados o es undefined/null
      if (!userinfo || userinfo.length === 0) {
        console.warn("Usuario no encontrado:", id);
        return null;
      }
      return userinfo;
    } catch (error) {
      console.error("Error al obtener información del usuario:", error);
      throw new Error("Error al consultar el usuario en la base de datos.");
    }
  }
}

module.exports = new AuthService();

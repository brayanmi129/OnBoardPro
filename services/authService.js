const crypto = require("crypto");
const { getdb } = require("../helpers/firebaseHelper.js"); // Importar la instancia de Firestore
const UserService = require("./userService.js"); // Importar la clase User
const jwt = require("jsonwebtoken");

class AuthService {
  async local(req, res) {
    const db = getdb();
    const { email, password } = req.body;

    try {
      // Buscar el usuario por email
      const snapshot = await db.collection("users").where("email", "==", email).get();
      if (snapshot.empty) {
        return res.status(404).send("No existe usuario con ese email.");
      }
      // Obtener el primer documento encontrado
      const userDoc = snapshot.docs[0].data();
      userDoc.id = snapshot.docs[0].id;
      // Verificar contraseña
      if (userDoc.password !== password) {
        console.log("contraseña incorrecta");
        return res.status(401).send("Contraseña incorrecta.");
      }
      console.log("Usuario autenticado:", userDoc);
      // Iniciar sesión con Passport
      req.login(userDoc, (err) => {
        if (err) {
          console.error("Error al iniciar sesión con Passport:", err);
          return res.status(500).send("Error al iniciar sesión.");
        }
        res.status(200).send({
          user: { id: userDoc.id, email: userDoc.email, rol: userDoc.rol },
        });
      });
    } catch (error) {
      console.error("Error en local:", error);
      res.status(500).send("Error interno del servidor.");
    }
  }

  async OAuth(profile) {
    console.log("Callback de autenticación");
    const user = await UserService.getByEmail(profile.emails[0].value);
    if (!user) return null;

    const payload = {
      id: user.user_id,
      email: user.email,
      role: user.role_name,
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: "3h",
    });

    return token;
  }
}
module.exports = new AuthService();

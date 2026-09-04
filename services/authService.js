const UserService = require("./userService.js");
const TenantService = require("./tenantService.js");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");

function generateToken(user) {
  return jwt.sign(
    { id: user.id, tenantId: user.tenantId || null, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: "3h" }
  );
}

class AuthService {
  async local(req, res) {
    const { email, password } = req.body;

    try {
      if (!email || !password) {
        return res.status(400).json({ message: "Debe ingresar un email y una contraseña." });
      }

      const userData = await UserService._getForAuth(email);
      if (!userData) {
        return res.status(404).json({ message: "No existe usuario con ese email." });
      }

      if (!userData.password) {
        return res.status(401).json({
          message: "Este usuario no tiene contraseña configurada. Usa Google o Microsoft.",
        });
      }

      const isValid = await bcrypt.compare(password, userData.password);
      if (!isValid) {
        return res.status(401).json({ message: "Contraseña incorrecta." });
      }

      const token = generateToken(userData);
      const { password: _, ...safeUser } = userData;
      return res.json({ userData: safeUser, token });
    } catch (error) {
      console.error("Error durante la autenticación local:", error);
      return res.status(500).json({ message: "Error del servidor." });
    }
  }

  async OAuthGoogle(profile) {
    try {
      const cuenta = profile?.emails?.[0];
      const email = cuenta?.value;
      if (!email) throw new Error("No se encontró el email en el perfil de Google.");

      // Las cuentas se unifican por correo: si el proveedor no confirma que le
      // pertenece, alguien podría reclamar un usuario que ya existe.
      if (cuenta.verified === false) {
        return { error: "Google no ha verificado este correo." };
      }

      const domain = email.split("@")[1];
      const tenant = await TenantService.getByDomain(domain);
      if (!tenant) {
        return { error: "Dominio no registrado en la plataforma." };
      }

      let user = await UserService._getForAuth(email);
      if (!user) {
        user = await UserService._createOAuthUser({
          email,
          firstname: profile.name?.givenName || "",
          lastname: profile.name?.familyName || "",
          tenantId: tenant.id,
        });
      }

      const token = generateToken(user);
      const { password: _, ...safeUser } = user;
      return { userData: safeUser, token };
    } catch (error) {
      console.error("Error en OAuth Google:", error);
      return null;
    }
  }

  async OAuthMicrosoft(profile) {
    try {
      const email = profile._json.mail || profile._json.userPrincipalName;
      if (!email) throw new Error("No se encontró el email en el perfil de Microsoft.");

      const domain = email.split("@")[1];
      const tenant = await TenantService.getByDomain(domain);
      if (!tenant) {
        return { error: "Dominio no registrado en la plataforma." };
      }

      let user = await UserService._getForAuth(email);
      if (!user) {
        user = await UserService._createOAuthUser({
          email,
          firstname: profile._json.givenName || "",
          lastname: profile._json.surname || "",
          tenantId: tenant.id,
        });
      }

      const token = generateToken(user);
      const { password: _, ...safeUser } = user;
      return { userData: safeUser, token };
    } catch (error) {
      console.error("Error en OAuth Microsoft:", error);
      return null;
    }
  }

  async me(id) {
    try {
      const userinfo = await UserService.getById(id);
      if (!userinfo) return null;
      return userinfo;
    } catch (error) {
      throw new Error("Error al consultar el usuario en la base de datos.");
    }
  }
}

module.exports = new AuthService();

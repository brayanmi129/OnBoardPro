const UserService = require("./userService.js");
const TenantService = require("./tenantService.js");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");

// Mínimo razonable para una contraseña nueva. El schema de usuario no impone
// longitud porque tambien acepta null (cuentas creadas por Google o Microsoft).
const MIN_PASSWORD = 8;

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

  // HU-071. Tener el JWT prueba que la sesión es de esta persona, pero no que
  // quien la usa sea su dueño: un equipo desatendido, o un token filtrado por el
  // ?token= del OAuth, alcanzarían. Por eso se exige además la contraseña actual.
  async cambiarPassword(id, actual, nueva) {
    if (!actual || !nueva) {
      return { estado: 400, message: "Debe enviar la contraseña actual y la nueva." };
    }
    if (typeof nueva !== "string" || nueva.length < MIN_PASSWORD) {
      return {
        estado: 400,
        message: `La nueva contraseña debe tener al menos ${MIN_PASSWORD} caracteres.`,
      };
    }
    if (actual === nueva) {
      return { estado: 400, message: "La nueva contraseña debe ser distinta de la actual." };
    }

    const user = await UserService._getForAuthById(id);
    if (!user) return { estado: 404, message: "Usuario no encontrado." };

    // Cuenta creada por un proveedor externo: nunca tuvo contraseña, así que no
    // hay una "actual" contra la cual comparar.
    if (!user.password) {
      return {
        estado: 409,
        message: "Esta cuenta inicia sesión con Google o Microsoft y no tiene contraseña.",
      };
    }

    const coincide = await bcrypt.compare(actual, user.password);
    if (!coincide) return { estado: 401, message: "La contraseña actual es incorrecta." };

    // updateUser ya hashea y valida contra el schema.
    const resultado = await UserService.updateUser(id, { password: nueva });
    if (resultado?.error) return { estado: 500, message: resultado.error };

    return { estado: 200, message: "Contraseña actualizada correctamente." };
  }

  async me(id) {
    try {
      // Se lee con el hash para poder informar oauthOnly, y se descarta enseguida.
      // Sin ese dato el front tendría que provocar un 409 para saber si la
      // cuenta puede cambiar su contraseña.
      const user = await UserService._getForAuthById(id);
      if (!user) return null;
      const { password, ...userinfo } = user;
      userinfo.oauthOnly = !password;
      return userinfo;
    } catch (error) {
      throw new Error("Error al consultar el usuario en la base de datos.");
    }
  }
}

module.exports = new AuthService();

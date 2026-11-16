const jwt = require("jsonwebtoken");
const { registrarAcceso } = require("../helpers/accesos.js");

// Con contraseña temporal (claim cambiarPassword del token) solo se puede ver
// la sesión y cambiarla: todo lo demás responde 403 hasta que la cambie.
const PERMITIDAS_CON_TEMPORAL = new Set(["GET /api/auth/me", "POST /api/auth/change-password"]);

function permitidaConTemporal(req) {
  const ruta = String(req.originalUrl || req.url || "").split("?")[0].replace(/\/+$/, "");
  return PERMITIDAS_CON_TEMPORAL.has(`${req.method} ${ruta}`);
}

function verifyJWT(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.locals.motivo = authHeader
      ? "La cabecera Authorization no empieza por \"Bearer \""
      : "No hay sesión: la petición no trae token";
    return res.status(401).json({ message: "Token no proporcionado" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    registrarAcceso(decoded);
    if (decoded.cambiarPassword && !permitidaConTemporal(req)) {
      res.locals.motivo = "Contraseña temporal: tiene que cambiarla antes de seguir";
      return res.status(403).json({
        message: "Tienes que cambiar tu contraseña temporal antes de continuar.",
        codigo: "CAMBIO_PASSWORD_REQUERIDO",
      });
    }
    next();
  } catch (err) {
    // "jwt expired", "invalid signature" (otro JWT_SECRET), "jwt malformed"...
    res.locals.motivo = err.expiredAt
      ? `La sesión venció el ${err.expiredAt.toISOString()}`
      : `Token no válido (${err.message})`;
    return res.status(401).json({ message: "Token inválido o expirado" });
  }
}

module.exports = verifyJWT;

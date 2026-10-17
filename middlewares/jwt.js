const jwt = require("jsonwebtoken");

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

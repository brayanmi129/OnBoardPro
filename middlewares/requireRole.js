function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      res.locals.motivo = "la ruta usa requireRole sin verifyJWT antes";
      return res.status(401).json({ message: "No autenticado" });
    }
    if (!allowedRoles.includes(req.user.role)) {
      // Va al log y, solo en desarrollo, al front como `detalle`.
      res.locals.motivo = `El usuario actual es "${req.user.role}" y esta ruta es solo para: ${allowedRoles.join(", ")}`;
      return res.status(403).json({ message: "Sin permisos para esta acción" });
    }
    next();
  };
}

module.exports = requireRole;

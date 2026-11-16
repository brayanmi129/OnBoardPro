// El superadministrador de OnBoard Pro administra la plataforma (las
// organizaciones), no lo que pasa dentro de cada una: eso es de su
// administrador. Dentro de una organización puede consultar todo, pero no
// crear, editar, publicar, calificar ni borrar.
//
// Única excepción: dar de alta al administrador de una organización, para que
// después ella se gestione sola. Y lo que es de toda la plataforma (las
// organizaciones y los logros genéricos) sigue siendo suyo.
//
// Va después de verifyJWT y del control de rol, y antes de cualquier
// middleware que procese archivos: así un 403 no deja nada subido.

const MENSAJE = "El superadministrador solo puede consultar las organizaciones; la gestión la hace su administrador.";

const esSuper = (req) => req.user?.role === "superadmin";

function negar(res, motivo, message = MENSAJE) {
  res.locals.motivo = motivo;
  return res.status(403).json({ message });
}

/** Escritura dentro de una organización: el superadmin no pasa. */
function soloLectura(req, res, next) {
  if (esSuper(req)) return negar(res, "el superadmin no modifica datos de una organización");
  next();
}

/** Alta de usuarios: el superadmin solo crea administradores de una organización. */
function soloCreaAdministradores(req, res, next) {
  if (esSuper(req) && req.body?.role !== "admin") {
    return negar(
      res,
      `el superadmin intentó crear un usuario con rol "${req.body?.role ?? ""}"`,
      "El superadministrador solo puede crear administradores; el resto de usuarios los crea el administrador de la organización.",
    );
  }
  next();
}

/** Logros: el superadmin solo crea los genéricos, que son de la plataforma. */
function soloLogrosGenericos(req, res, next) {
  if (esSuper(req) && req.body?.generico !== true) {
    return negar(res, "el superadmin intentó crear un logro de una organización");
  }
  next();
}

/** Vista previa de un logro: el superadmin solo la pide para uno genérico (sin organización). */
function soloVistaPreviaGenerica(req, res, next) {
  if (esSuper(req) && req.body?.tenantId) {
    return negar(res, "el superadmin pidió la vista previa de un logro de una organización");
  }
  next();
}

module.exports = { soloLectura, soloCreaAdministradores, soloLogrosGenericos, soloVistaPreviaGenerica, MENSAJE };

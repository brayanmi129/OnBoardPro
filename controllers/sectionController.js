const SectionService = require("../services/sectionService.js");

function tenantDe(req) {
  return req.user.role === "superadmin" ? null : req.user.tenantId;
}

// Un solo lugar donde se traduce el error a respuesta: los servicios marcan el
// status y acá se respeta, en vez de repetir el if en cada método.
function responder(res, error, contexto) {
  console.error(`${contexto}:`, error.message);
  return res
    .status(error.status || 500)
    .json({ error: error.message, ...(error.campos ? { campos: error.campos } : {}) });
}

class SectionController {
  static async listar(req, res) {
    try {
      // El aprendiz no ve secciones vacías: un título sin contenido no le
      // aporta nada y parece un error del sistema.
      const soloConContenido = req.user.role === "student";
      const secciones = await SectionService.listar(req.params.id, tenantDe(req), {
        soloConContenido,
      });
      return res.status(200).json(secciones);
    } catch (error) {
      return responder(res, error, "Error al listar las secciones");
    }
  }

  static async crear(req, res) {
    try {
      const seccion = await SectionService.crear(req.params.id, tenantDe(req), req.body);
      return res.status(201).json(seccion);
    } catch (error) {
      return responder(res, error, "Error al crear la sección");
    }
  }

  static async renombrar(req, res) {
    try {
      const r = await SectionService.renombrar(req.params.id, tenantDe(req), req.body?.name);
      return res.status(200).json(r);
    } catch (error) {
      return responder(res, error, "Error al renombrar la sección");
    }
  }

  static async eliminar(req, res) {
    try {
      const r = await SectionService.eliminar(req.params.id, tenantDe(req));
      return res.status(200).json(r);
    } catch (error) {
      return responder(res, error, "Error al eliminar la sección");
    }
  }

}

module.exports = SectionController;

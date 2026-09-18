const ActivitiesService = require("../services/actividades.js");

// Antes las rutas de actividades apuntaban directo al servicio, así que este
// recibía (req, res) creyendo que eran (datos, archivo). El servicio trataba la
// respuesta como un archivo, Google Drive lanzaba, y al ser una promesa
// rechazada sin capturar Node mataba el proceso entero: una sola petición
// tumbaba la API para todos. Este controlador existe para cerrar esa frontera.
function tenantDe(req) {
  return req.user.role === "superadmin" ? null : req.user.tenantId;
}

class ActivitiesController {
  static async getAll(req, res) {
    try {
      const actividades = await ActivitiesService.getAll(tenantDe(req));
      return res.status(200).json(actividades);
    } catch (error) {
      console.error("Error al obtener las actividades:", error.message);
      return res.status(500).json({ message: "Error al obtener las actividades" });
    }
  }

  static async create(req, res) {
    try {
      const tenantId =
        req.user.role === "superadmin" ? req.body.tenantId || null : req.user.tenantId;
      const actividad = await ActivitiesService.create(
        { ...req.body, tenantId },
        req.file || null
      );
      return res.status(201).json(actividad);
    } catch (error) {
      console.error("Error al crear la actividad:", error.message);
      return res.status(400).json({ message: error.message });
    }
  }

  // El adjunto vive en un bucket privado: no hay URL permanente, se firma una
  // temporal cada vez que alguien con acceso la pide.
  static async adjunto(req, res) {
    try {
      const url = await ActivitiesService.urlAdjunto(req.params.id, tenantDe(req));
      if (!url) return res.status(404).json({ message: "Actividad o adjunto no encontrado" });
      return res.status(200).json({ url });
    } catch (error) {
      console.error("Error al firmar el adjunto:", error.message);
      return res.status(500).json({ message: "Error al obtener el adjunto" });
    }
  }
}

module.exports = ActivitiesController;

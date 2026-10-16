const EntregaService = require("../services/entregaService.js");

function actorDe(req) {
  return {
    id: req.user.id,
    email: req.user.email,
    role: req.user.role,
    tenantId: req.user.tenantId,
  };
}

function responder(res, error, contexto) {
  console.error(`${contexto}:`, error.message);
  return res.status(error.status || 500).json({ message: error.message });
}

class EntregaController {
  /** El aprendiz sube o reemplaza su entrega. */
  static async entregar(req, res) {
    try {
      const r = await EntregaService.entregar(req.params.id, actorDe(req), {
        archivo: req.file || null,
        comentario: req.body?.comentario,
      });
      return res.status(200).json(r);
    } catch (error) {
      return responder(res, error, "Error al registrar la entrega");
    }
  }

  static async miEntrega(req, res) {
    try {
      const entrega = await EntregaService.miEntrega(req.params.id, actorDe(req));
      if (!entrega) return res.status(404).json({ message: "Todavía no entregaste esta actividad." });
      return res.status(200).json(entrega);
    } catch (error) {
      return responder(res, error, "Error al consultar la entrega");
    }
  }

  /** Quien corrige ve todas las entregas de la actividad. */
  static async listar(req, res) {
    try {
      return res.status(200).json(await EntregaService.listar(req.params.id, actorDe(req)));
    } catch (error) {
      return responder(res, error, "Error al listar las entregas");
    }
  }

  /** El instructor decide si la entrega queda completa o hay que rehacerla. */
  static async revisar(req, res) {
    try {
      const r = await EntregaService.revisar(req.params.id, actorDe(req), {
        aprobada: req.body?.aprobada,
        feedback: req.body?.feedback,
      });
      return res.status(200).json(r);
    } catch (error) {
      return responder(res, error, "Error al revisar la entrega");
    }
  }

  static async archivo(req, res) {
    try {
      const url = await EntregaService.urlArchivo(req.params.id, actorDe(req));
      // Mismo 404 si no existe, si no tiene archivo o si no es tuya: distinguirlos
      // dejaría averiguar quién entregó qué.
      if (!url) return res.status(404).json({ message: "Archivo no encontrado" });
      return res.status(200).json({ url });
    } catch (error) {
      return responder(res, error, "Error al obtener el archivo");
    }
  }
}

module.exports = EntregaController;

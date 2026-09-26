const gamificationService = require("../services/gamificationService.js");

class GamificationController {
  static async getRanking(req, res) {
    try {
      // El superadmin (null) ve el ranking global; el resto, el de su empresa.
      const tenantId = req.user.role === "superadmin" ? null : req.user.tenantId;
      const ranking = await gamificationService.getRanking(tenantId);
      res.status(200).json(ranking);
    } catch (error) {
      console.error("Error al obtener los grupos:", error);
      res.status(500).send("Error al obtener los grupos");
    }
  }

  static async completar(req, res) {
    try {
      const tenantId = req.user.role === "superadmin" ? null : req.user.tenantId;
      const r = await gamificationService.completarActividad(
        req.user.id, req.params.id, tenantId
      );
      return res.status(200).json(r);
    } catch (error) {
      console.error("Error al completar la actividad:", error.message);
      return res.status(error.status || 500).json({ message: error.message });
    }
  }

  static async miProgreso(req, res) {
    try {
      return res.status(200).json(await gamificationService.miProgreso(req.user.id));
    } catch (error) {
      console.error("Error al obtener el progreso:", error.message);
      return res.status(error.status || 500).json({ message: error.message });
    }
  }
}

module.exports = GamificationController;

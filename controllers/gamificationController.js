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
}

module.exports = GamificationController;

const gamificationService = require("../services/gamificationService.js");

class GamificationController {
  static async getRanking(req, res) {
    try {
      const groups = await gamificationService.getRanking();
      res.status(200).json(groups);
    } catch (error) {
      console.error("Error al obtener los grupos:", error);
      res.status(500).send("Error al obtener los grupos");
    }
  }
}

module.exports = GamificationController;

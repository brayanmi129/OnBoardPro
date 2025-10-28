const multer = require("multer");
const ActivitiesService = require("../services/activitiesService.js");

const storage = multer.memoryStorage();
const upload = multer({ storage });

class ActivitiesController {
  static async getAll(req, res) {
    try {
      const activities = await ActivitiesService.getAll();
      res.status(200).json(activities);
    } catch (error) {
      console.error("Error al obtener las actividades:", error);
      res.status(500).send("Error al obtener las actividades");
    }
  }

  static async create(req, res) {
    upload.single("file")(req, res, async (err) => {
      if (err) return res.status(400).send("Error al cargar el archivo");

      try {
        const file = req.file;
        const data = JSON.parse(req.body.data);
        const newActivity = await ActivitiesService.create(data, file);
        res.status(201).json(newActivity);
      } catch (error) {
        console.error("Error al crear la actividad:", error.message);
        res.status(400).send(error.message || "Datos inválidos");
      }
    });
  }
}

module.exports = ActivitiesController;

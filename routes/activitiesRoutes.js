// routes/authRoutes.js
const express = require("express");
const router = express.Router();

const actividades = require("../services/actividades.js");

// Definir rutas
router.get("/get/all", actividades.getAll);

router.post("/create", actividades.create); // Ruta para iniciar sesión

module.exports = router; // Exporta el router

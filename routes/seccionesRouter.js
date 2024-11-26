// routes/authRoutes.js
const express = require('express');
const router = express.Router();

const Seccion = require('../entidad/seccion.js')

// Definir rutas
router.get('/get/all', Seccion.getAll);


module.exports = router; // Exporta el router


// routes/authRoutes.js
const express = require('express');
const router = express.Router();

const entregables = require('../entidad/entregable.js')

// Definir rutas
router.get('/get/all', entregables.getAll);

router.post('/create', entregables.create); // Ruta para iniciar sesión


module.exports = router; // Exporta el router
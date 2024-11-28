// routes/authRoutes.js
const express = require('express');
const router = express.Router();

const Seccion = require('../entidad/seccion.js')

// Definir rutas
router.get('/get/all', Seccion.getAll);

router.get('/get/activities/:id_seccion', Seccion.getActivities); //Actividades de una seccion

router.post('/create', Seccion.create); // Ruta para iniciar sesión


module.exports = router; // Exporta el router


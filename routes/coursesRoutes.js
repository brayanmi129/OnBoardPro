// routes/authRoutes.js
const express = require('express');
const router = express.Router();

// Importa el controlador de autenticación
const CourseController = require('../control/coursescontroller.js');

// Definir rutas
router.get('/get', CourseController.getCourses); // Ruta para iniciar sesión

router.get('/get/id/:id', CourseController.searchUserByIdByRequest); // Ruta para iniciar sesión

router.post('/create/new', CourseController.createCourseByRequest); // Ruta para iniciar sesión


module.exports = router; // Exporta el router


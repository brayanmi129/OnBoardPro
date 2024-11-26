// routes/authRoutes.js
const express = require('express');
const router = express.Router();

// Importa el controlador de autenticación
const CourseController = require('../control/coursescontroller.js');

// Definir rutas
router.get('/get/all', CourseController.fetchAllCourses); // Ruta para iniciar sesión

router.get('/get/id/:id', CourseController.fetchCoursesById); // Ruta para iniciar sesión

router.post('/create', CourseController.createCourse); // Ruta para iniciar sesión


module.exports = router; // Exporta el router


// routes/authRoutes.js
const express = require('express');
const router = express.Router();

const Course = require('../entidad/curso.js')

// Importa el controlador de autenticación

// Definir rutas
router.get('/get/all', Course.getAll); // Ruta para iniciar sesión

router.get('/get/id/:id', Course.getById); // Ruta para iniciar sesión

router.get('/get/usersCourses/:id_user', Course.getUserCourses); // Cursos de un usuario

router.get('/get/coursesUsers/:id_course', Course.getCoursesUsers);  //Usuarios de un curso

router.get('/get/seccions/:id_course', Course.getSeccions)

router.post('/create', Course.createCourse); // Ruta para iniciar sesión


module.exports = router; // Exporta el router


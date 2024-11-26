// routes/authRoutes.js
const express = require('express');
const router = express.Router();

const Course = require('../entidad/curso.js')

// Importa el controlador de autenticación
const CourseController = require('../control/coursescontroller.js');

// Definir rutas
router.get('/get/all', Course.getAll); // Ruta para iniciar sesión

router.get('/get/id/:id', Course.getById); // Ruta para iniciar sesión

router.get('/get/usersInCourses/:id_user', CourseController.fetchusersCourse); // Cursos de un usuario

router.get('/get/coursesInUsers/:id_course', CourseController.fetchCoursesUser);  //Usuarios de un curso

router.get('/get/seccions/:id_course', Course.getSeccions)

router.post('/create', CourseController.createCourse); // Ruta para iniciar sesión


module.exports = router; // Exporta el router


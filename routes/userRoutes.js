// routes/authRoutes.js
const express = require('express');
const router = express.Router();

// Importa el controlador de autenticación
const User = require('../entidad/usuario.js')

// Definir rutas
router.get('/get/all', User.getAll); // Ruta para iniciar sesión
router.get('/get/email/:email', User.getByEmail);
router.get('/get/id/:id', User.getById);
router.get('/get/rol/:rol', User.getByRole)
router.post('/create', User.create);

router.get('/get/courses/:id_user', User.getUserCourses); // Cursos de un usuario


module.exports = router; // Exporta el router


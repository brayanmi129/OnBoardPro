// routes/authRoutes.js
const express = require('express');
const router = express.Router();

// Importa el controlador de autenticación
const UserController = require('../control/usercontroller.js');
const User = require('../entidad/usuario.js')

// Definir rutas
router.get('/get/all', UserController.fetchAllUsers); // Ruta para iniciar sesión
router.get('/get/email/:email', UserController.fetchUserByEmail);
router.get('/get/id/:id', UserController.fetchUserById);
router.get('/get/rol/:rol', UserController.fetchUserByRole)
router.post('/create', UserController.createUser);


module.exports = router; // Exporta el router


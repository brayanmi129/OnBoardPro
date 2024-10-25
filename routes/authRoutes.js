// routes/authRoutes.js
const express = require('express');
const passport = require('passport');
const router = express.Router();
const path = require('path');

require('../api-ext/google/googleproperties.js');


// Importa el controlador de autenticación
const AuthController = require('../control/authcontroller.js');

// Definir rutas
router.post('/localuser', AuthController.AuthUser ); // Ruta para iniciar sesión

router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }) ); // Ruta para iniciar sesión

router.get('/google/callback',
    passport.authenticate('google', { failureRedirect: '/' }),
    (req, res) => {
        // Verifica si hay un usuario autenticado
        if (!req.user) {
            return res.status(401).json({ message: 'Error de autenticación. Intenta de nuevo.' });
        }

        // Aquí 'req.user' contendrá el perfil del usuario autenticado
        const userEmail = req.user.email; // Obtiene el correo electrónico
        console.log(`Usuario autenticado: ${userEmail}`); // Imprime el correo electrónico en la consola

        // Redirige a la página de éxito o envía una respuesta JSON
        res.status(200).sendFile(path.join(__dirname, '../public/inicio.html'));
    }
);


module.exports = router; // Exporta el router


// express
const express = require('express');
const session = require('express-session');
const passport = require('passport');
require('./control/externos/google/googleproperties.js');
const app = express();

//firebase
const { conectfirebase } = require('./control/externos/firebase/firebaseinit.js');
const functions = require('firebase-functions');
conectfirebase();

//google
app.use(session({ secret: 'studify2024', resave: false, saveUninitialized: true }));

app.use(passport.initialize());
app.use(passport.session());

//routes
const userRoutes = require('./routes/userroutes.js');
const authRoutes = require('./routes/authRoutes.js');


//middlewares para poder recibir datos json
app.use(express.json());
app.use(express.static('public'));


const cors = require('cors');

app.use(cors({
    origin: '*', // Permitir solo este origen
    methods: ['GET', 'POST', 'PUT', 'DELETE'], // Métodos permitidos
    allowedHeaders: ['Content-Type'], // Encabezados permitidos
}));

app.use('/api/users', userRoutes);
app.use('/api/auth', authRoutes);

app.listen(3000, () => {
    console.log('Servidor iniciado en http://localhost:3000');
});


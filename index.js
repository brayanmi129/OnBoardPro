// express
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const port = process.env.PORT || 3000;
const app = express();

//firebase
const { conectfirebase } = require('./api-ext/firebase/firebaseinit.js');
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

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html'); 
});

app.listen(port, () => {
    console.log('Servidor iniciado en http://localhost:3000');
});


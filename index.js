// express
const express = require('express');
const session = require('express-session');
const passport = require('passport');
require('dotenv').config(); // Importar la configuración de las variables de entorno
const port = process.env.PORT || 3000;
const app = express();

//firebase
const { conectfirebase } = require('./api-ext/firebase/firebaseinit.js');
conectfirebase();

//google
app.use(session({ secret: 'studify2024', resave: false, saveUninitialized: false }));

app.use(passport.initialize());
app.use(passport.session());

//routes
const userRoutes = require('./routes/userRoutes.js');
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

app.use('/users', userRoutes);
app.use('/auth', authRoutes);


app.get('/*', (req, res) => {
    res.sendFile(__dirname + '/public/index.html'); 
});

app.listen(port, () => console.log('Server ready on port 3000.'));

// express
const express = require('express');
const session = require('express-session');
const passport = require('passport');
require('dotenv').config(); // Importar la configuración de las variables de entorno
const port = process.env.PORT || 3000;
const app = express();

//firebase
const { conectfirebase } = require('./control/firebaseController.js');
conectfirebase();

//google
app.use(session({
    secret: 'studify2024', 
    resave: false, 
    saveUninitialized: false,
    cookie: { 
        secure: false,  // Si estás usando HTTP
        maxAge: 1000 * 60 * 60 * 24 // 1 día, por ejemplo
    }
}));


// Inicializar Passport y el middleware de sesión
app.use(passport.initialize());
app.use(passport.session());

//routes
const userRoutes = require('./routes/userRoutes.js');
const authRoutes = require('./routes/authRoutes.js');
const courseRoutes = require('./routes/coursesRoutes.js');
const seccionRoutes = require('./routes/seccionesRouter.js')
const activitiesRoutes = require('./routes/activitiesRoutes.js')
const entregableRoutes = require('./routes/entregablesRoutes.js')

//middlewares para poder recibir datos json
app.use(express.json());
app.use(express.static('public'));


const cors = require('cors');

app.use(cors({
    origin: '*',  // Cambia esto por el origen correcto
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type'],
}));

app.use('/api/users', userRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/courses', courseRoutes);
app.use('/api/seccions',seccionRoutes)
app.use('/api/activities',activitiesRoutes)
app.use('/api/entregables',entregableRoutes)


app.get('/*', (req, res) => {
    res.sendFile(__dirname + '/public/index.html'); 
});

app.listen(port, () => console.log(`Server ready on port ${port}.`));

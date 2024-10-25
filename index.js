// express
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const port = process.env.PORT || 3000;
const app = express();

//firebase
const { conectfirebase } = require('./api-ext/firebase/firebaseinit.js');
conectfirebase();

//google
app.use(session({ secret: 'studify2024', resave: false, saveUninitialized: true }));

app.use(passport.initialize());
app.use(passport.session());

app.use(express.json());
app.use(express.static('public'));

const cors = require('cors');

app.use(cors({
    origin: '*', // Permitir solo este origen
    methods: ['GET', 'POST', 'PUT', 'DELETE'], // Métodos permitidos
    allowedHeaders: ['Content-Type'], // Encabezados permitidos
}));


//routes
const userRoutes = require('./routes/userroutes.js');
const authRoutes = require('./routes/authroutes.js');

app.use('/users', userRoutes);
app.use('/auth', authRoutes);

app.get('/login', (req, res) => {
    res.sendFile(__dirname + '/public/inicio.html');
});


app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html'); 
});


app.listen(port, () => {
  console.log(`port runing in http://localhost:${port}`);
});
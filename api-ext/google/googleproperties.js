const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const { getdb } = require('../firebase/firebaseinit.js');

const UserController = require('../../control/usercontroller.js');
const AuthController = require('../../control/authcontroller.js');
const User = require('../../entidad/usuario.js'); // Importar la clase User


passport.use(new GoogleStrategy({
    clientID: '93795014782-iq9pi0sqeei1290k81lugr3nhclhej26.apps.googleusercontent.com',
    clientSecret: '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',
    callbackURL: `${process.env.URL}/api/auth/google/callback`
}, async (accessToken, refreshToken, profile, done) => {
    try {
        const user = await AuthController.AuthUserByGoogleMethod(profile);
        return done(null, user);
    } catch (error) {
        console.error('Error en GoogleStrategy:', error);
        done(error);
    }
}));


passport.serializeUser((user, done) => {
    console.log('Usuario encontrado en serialisacion:', user.id);
    done(null, user.id); // Serializar el usuario por ID
});


passport.deserializeUser(async (id, done) => {
    console.log("Entrando a deserealizacion");
    try {
        const db = getdb(); // Asegúrate de que esta función obtenga correctamente la instancia de Firestore
        const userRef = db.collection('users').doc(id);
        const userDoc = await userRef.get();

        if (userDoc.exists) {
            done(null, userDoc.data()); // Si el documento existe, retorna los datos del usuario
        } else {
            done(new Error('Usuario no encontrado')); // Si no existe, lanza error
        }
    } catch (err) {
        done("error en deserealizacion: " , err); // Maneja errores
    }
});





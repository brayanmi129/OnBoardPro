const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const { getdb } = require('../firebase/firebaseinit.js');

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
    const sessionUser = { id: user.id, rol: user.rol, email: user.email }; // Incluye el rol si es necesario
    console.log('Usuario serializado:', sessionUser);
    done(null, sessionUser);
});


passport.deserializeUser(async (sessionUser, done) => {
    try {
        const db = getdb();
        const userRef = db.collection('users').doc(sessionUser.id);
        const userDoc = await userRef.get();

        if (userDoc.exists) {
            done(null, { id: sessionUser.id, rol: sessionUser.rol });
        } else {
            done(new Error('Usuario no encontrado'));
        }
    } catch (err) {
        done(err);
    }
});





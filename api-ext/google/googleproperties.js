const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const UserController = require('../../control/usercontroller.js');
const { getdb } = require('../firebase/firebaseinit.js');
const User = require('../../entidad/usuario.js'); // Importar la clase User
const { getDoc, doc } = require('firebase/firestore'); // Asegúrate de que el path sea correcto


passport.use(new GoogleStrategy({
    clientID: '93795014782-iq9pi0sqeei1290k81lugr3nhclhej26.apps.googleusercontent.com',
    clientSecret: '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',
    callbackURL: 'https://studifyuc.onrender.com/auth/google/callback'
}, async (accessToken, refreshToken, profile, done) => {
    try {
        // Intentar encontrar al usuario por su correo
        console.log('Perfil de Google:', profile);
        const existingUser = await UserController.getuserbyemail(profile.emails[0].value);

        if (existingUser) {
            return done(null, existingUser);
        } else {
            // Crear un nuevo usuario usando la clase User
            const newUser = new User({
                username: profile.displayName, 
                email: profile.emails[0].value,
                rol: 'Estudiante', 
            });

            // Validar el usuario usando el esquema Zod
            const validation = User.validate(newUser.getUserData());
            if (!validation.success) {
                throw new Error(validation.error.errors[0].message);
            }else{
            // Crear el usuario en Firestore
            const createdUser = await UserController.createUser(newUser.getUserData());
            console.log('Usuario creado:', createdUser);
            return done(null, createdUser);
            }

        }
    } catch (error) {
        console.error('Error en GoogleStrategy:', error);
        done(error);
    }
}));


passport.serializeUser((user, done) => {
    done(null, user.id); // Serializar el usuario por ID
});

passport.deserializeUser(async (id, done) => {
    try {
        const db = getdb();
        const userDoc = await getDoc(doc(db, 'users', id));
        if (userDoc.exists()) {
            done(null, userDoc.data());
        } else {
            done(new Error('Usuario no encontrado'));
        }
    } catch (err) {
        done(err);
    }
});




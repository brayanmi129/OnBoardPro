const crypto = require('crypto');

const functions = require('firebase-functions'); // Importar funciones de Firebase
const { getdb } = require('../api-ext/firebase/firebaseinit.js'); // Importar la instancia de Firestore

const UserController = require('./usercontroller.js');
const User = require('../entidad/usuario.js'); // Importar la clase User

class AuthController{

    async AuthUserByNormalMethod(req, res) {
        const db = getdb();
        const { email, password } = req.body;
    
        try {
            // Buscar el usuario por email
            const snapshot = await db.collection('users').where('email', '==', email).get();
            if (snapshot.empty) {
                return res.status(404).send('No existe usuario con ese email.');
            }
            // Obtener el primer documento encontrado
            const userDoc = snapshot.docs[0].data();
            userDoc.id = snapshot.docs[0].id;
            // Verificar contraseña
            if (userDoc.password !== password) {
                return res.status(401).send('Contraseña incorrecta.');
            }
            console.log('Usuario autenticado:', userDoc);
            // Iniciar sesión con Passport
            req.login(userDoc, (err) => {
                if (err) {
                    console.error('Error al iniciar sesión con Passport:', err);
                    return res.status(500).send('Error al iniciar sesión.');
                }
                res.status(200).send({
                    message: 'Inicio de sesión exitoso.',
                    user: { id: userDoc.id, email: userDoc.email, rol: userDoc.rol },
                });
            });
        } catch (error) {
            console.error("Error en AuthUserByNormalMethod:", error);
            res.status(500).send('Error interno del servidor.');
        }
    }
    
    

    async AuthUserByGoogleMethod(profile) { 

        const existingUser = await UserController.searchUserbyEmail(profile.emails[0].value);
        if (existingUser) {
            return existingUser
        } else {

            //const createdUser = await UserController.createUser(profile);
            
            let customId = crypto.randomBytes(Math.ceil(10 / 2)).toString('hex').slice(0, 10);
            console.log('ID generado:', customId);

            // Crear un nuevo usuario usando la clase User
            const newUser = new User({
                id: customId,
                fisrtname: profile.displayName, 
                email: profile.emails[0].value,
                rol: 'Aprendiz', 
                lastname: '',
                phonumber: '',
                level: 0,
                password: '',
                courses: [],
                group: 'onboarding',
                status: 'Active',
                
            });

            // Validar el usuario usando el esquema Zod
            const validation = User.validate(newUser.getUserData());
            if (!validation.success) {
                console.log("Error con zod")
                throw new Error(validation.error);
            }else{
            // Crear el usuario en Firestore
            const createdUser = await UserController.createUser(newUser.getUserData());
            console.log('Usuario creado:', createdUser);
            return createdUser
            }

        }
    }

}
module.exports = new AuthController();



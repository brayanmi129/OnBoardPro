const crypto = require('crypto');

const functions = require('firebase-functions'); // Importar funciones de Firebase
const { getdb } = require('../api-ext/firebase/firebaseinit.js'); // Importar la instancia de Firestore
const User = require('../entidad/usuario.js'); // Importar la clase User
const userSchema = require('../schemas/userSchemas.js'); // Importar el esquema de validación de usuario

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
                console.log("contraseña incorrecta")
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
                    user,
                });
            });
        } catch (error) {
            console.error("Error en AuthUserByNormalMethod:", error);
            res.status(500).send('Error interno del servidor.');
        }
    }
    
    

    async AuthUserByGoogleMethod(profile) { 

        const existingUser = await User.getByEmail(profile.emails[0].value);
        if (existingUser) {
            return existingUser
        } else {
            
            let customId = crypto.randomBytes(Math.ceil(10 / 2)).toString('hex').slice(0, 10);
            console.log('ID generado:', customId);

            // Crear un nuevo usuario usando la clase User
            const newUser =({
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

            respuesta = User.create2(newUser)
            console.log('Usuario creado:', respuesta);

        }
    }

}
module.exports = new AuthController();



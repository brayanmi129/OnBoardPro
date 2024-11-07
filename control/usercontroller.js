
const { getdb } = require('../api-ext/firebase/firebaseinit.js'); // Importar la instancia de Firestore

class UserController {

    // Método para obtener usuarios
    async getUsers(req, res) {
        const db = getdb(); // Obtener la instancia de Firestore
        try {
            // Obtener todos los documentos de la colección 'users'
            const snapshot = await db.collection('users').get();
            
            // Crear un arreglo para almacenar los datos de los documentos
            const users = [];
    
            // Iterar sobre los documentos y agregar sus datos al arreglo
            snapshot.forEach(doc => {
                users.push({ id: doc.id, ...doc.data() });
            });
    
            // Enviar la respuesta con los datos
            res.status(200).send(users);
        } catch (error) {
            console.error("Error al obtener los usuarios: ", error);
            res.status(500).send("Error al obtener los usuarios");
        }
    }

    async getuserbyemail(email) {
        const db = getdb();
        const collectionReference = db.collection('users');
    
        try {
            const snapshot = await collectionReference.where('email', '==', email).get();
    
            if (snapshot.empty) {
                console.log('No matching documents for email:', email);
                return false; // Retorna null si no hay coincidencias
            }
    
            let userData = null; // Variable para almacenar los datos del usuario
            snapshot.forEach(doc => {
                console.log('ID del usuario encontrado: ', doc.id);
                userData = {
                    id: doc.id, // ID del documento
                    ...doc.data() // Datos del documento
                };
            });
    
            return userData; // Retorna el objeto con los datos del usuario
        } catch (error) {
            console.error("Error al obtener el usuario", email, error);
            throw new Error("Error al obtener el usuario");
        }
    }

    async createUser(user) {
        const db = getdb(); // Obtén la instancia de la base de datos
        const collectionReference = db.collection('users'); // Referencia a la colección 'users'
    
        try {
            // Crea un nuevo documento en la colección con los datos del usuario
            const docRef = await collectionReference.add(user);
            console.log('Usuario creado con ID:', docRef.id);
            
            // Retorna el objeto del usuario creado, incluyendo su ID
            return {
                id: docRef.id,
                ...user
            };
        } catch (error) {
            console.error("Error al crear el usuario:", error);
            throw new Error("Error al crear el usuario");
        }
    }
}

module.exports = new UserController();

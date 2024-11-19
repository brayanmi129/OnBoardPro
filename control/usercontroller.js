
const { getdb } = require('../api-ext/firebase/firebaseinit.js'); // Importar la instancia de Firestore
const User  = require('../entidad/usuario.js')

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

    async searchUserbyEmail(email) {
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
        }
    }

    async searchUsersByEmailByrequest(req, res) {
        const email = req.params.email;

        const db = getdb();
        const collectionReference = db.collection('users');
    
        try {
            const snapshot = await collectionReference.where('email', '==', email).get();
    
            if (snapshot.empty) {
                console.log('No matching documents for email:', email);
                res.status(404).send('No matching documents for email:', email);
            }
    
            let userData = null; // Variable para almacenar los datos del usuario
            snapshot.forEach(doc => {
                console.log('ID del usuario encontrado: ', doc.id);
                userData = {
                    id: doc.id, // ID del documento
                    ...doc.data() // Datos del documento
                };
            });
    
            res.status(200).send(userData); // Retorna el objeto con los datos del usuario
        } catch (error) {
            console.error("Error al obtener el usuario", email, error);
            res.status(500).send('No matching documents for email:', email);
        }
    }

    async searchUserById(userId) {
    
        const db = getdb();
        const collectionReference = db.collection('users');
    
        try {
            const doc = await collectionReference.doc(userId).get();
    
            if (!doc.exists) {
                console.log('No matching document with ID:', userId);
            }
    
            const userData = {
                id: doc.id, // ID del documento
                ...doc.data() // Datos del documento
            };
    
            return userData; // Retorna el objeto con los datos del usuario
        } catch (error) {
            console.error("Error al obtener el usuario con ID", userId, error);
        
        }
    }

    async searchUserByIdByRequest(req, res) {
        const userId = req.params.id; // ID del documento a buscar
    
        const db = getdb();
        const collectionReference = db.collection('users');
    
        try {
            const doc = await collectionReference.doc(userId).get();
    
            if (!doc.exists) {
                console.log('No matching document with ID:', userId);
                return res.status(404).send('No matching document with ID: ' + userId);
            }
    
            const userData = {
                id: doc.id, // ID del documento
                ...doc.data() // Datos del documento
            };
    
            res.status(200).send(userData); // Retorna el objeto con los datos del usuario
        } catch (error) {
            console.error("Error al obtener el usuario con ID", userId, error);
            res.status(500).send('Error al obtener el usuario con ID: ' + userId);
        }
    }

    async searchUsersByRole(role) {
    
        const db = getdb();
        const collectionReference = db.collection('users');
    
        try {
            const snapshot = await collectionReference.where('rol', '==', rol).get();
    
            if (snapshot.empty) {
                console.log('No matching documents for role:', role);
            }
    
            const usersData = []; // Array para almacenar los datos de todos los usuarios que cumplen el rol
            snapshot.forEach(doc => {
                usersData.push({
                    id: doc.id, // ID del documento
                    ...doc.data() // Datos del documento
                });
            });
    
            return usersData; // Retorna un array con los datos de los usuarios
        } catch (error) {
            console.error("Error al obtener usuarios con rol", role, error);
            res.status(500).send('Error al obtener usuarios con rol: ' + role);
        }
    }

    async searchUsersByRoleByRequest(req, res) {
        const role = req.params.role; // El valor de "rol" a buscar
    
        const db = getdb();
        const collectionReference = db.collection('users');
    
        try {
            const snapshot = await collectionReference.where('rol', '==', role).get();
    
            if (snapshot.empty) {
                console.log('No matching documents for role:', role);
                return res.status(404).send('No matching documents for role: ' + role);
            }
    
            const usersData = []; // Array para almacenar los datos de todos los usuarios que cumplen el rol
            snapshot.forEach(doc => {
                usersData.push({
                    id: doc.id, // ID del documento
                    ...doc.data() // Datos del documento
                });
            });
    
            res.status(200).send(usersData); // Retorna un array con los datos de los usuarios
        } catch (error) {
            console.error("Error al obtener usuarios con rol", role, error);
        }
    }

    async createUser(user) {
        const db = getdb(); // Obtén la instancia de la base de datos
        const collectionReference = db.collection('users'); // Referencia a la colección 'users'

    
        try {
            // Crea un nuevo documento en la colección con los datos del usuario
            const docRef = collectionReference.doc(user.id); // Define el ID personalizado
            await docRef.set(user); // Guarda los datos del usuario en el documento con el ID definido
        
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

    async createUserByRequest(req, res) {
        const db = getdb(); // Obtén la instancia de la base de datos
        const collectionReference = db.collection('users'); // Referencia a la colección 'users'
    
        try {
            // Obtiene los datos del usuario desde el cuerpo de la solicitud
            const userData = req.body;
    
            // Valida los datos usando el esquema Zod de la clase User
            const validationResult = User.validate(userData);
    
            // Si la validación falla, responde con un error y los detalles de la validación
            if (!validationResult.success) {
                return res.status(400).json({
                    error: 'Datos de usuario no válidos',
                    details: validationResult.error.errors
                });
            }
    
            // Si la validación es exitosa, crea el nuevo documento en la colección 'users'
            const docRef = await collectionReference.add(userData);
            console.log('Usuario creado con ID:', docRef.id);
    
            // Retorna el objeto del usuario creado, incluyendo su ID
            res.status(201).json({
                id: docRef.id,
                ...userData
            });
        } catch (error) {
            console.error("Error al crear el usuario:", error);
            res.status(500).json({ error: 'Error al crear el usuario' });
        }
    }
    
}

module.exports = new UserController();

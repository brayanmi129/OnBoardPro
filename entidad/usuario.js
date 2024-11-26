const zod = require('zod');
const { getdb } = require('../api-ext/firebase/firebaseinit.js'); // Importar la instancia de Firestore

const db = getdb()

class User {
    // Definir el esquema Zod para validar los datos de usuario
    static schema = zod.object({
        id: zod.string().min(1).max(50),
        fisrtname: zod.string().min(1).max(50).optional(),
        lastname: zod.string().optional(),
        phonumber: zod.string().optional(),
        email: zod.string().email(), // Validar que el correo sea un formato válido
        level: zod.number().int().optional(),
        password: zod.string().optional(), // Contraseña opcional
        rol: zod.enum(['Aprendiz', 'Administrador', 'Instructor']).default('Aprendiz'), // Rol por defecto
        group: zod.string().default('onboarding'), // Valor predeterminado si no se define
        status: zod.enum(['Active', 'Inactive']).default('Active'), // Rol por defecto
   });

    constructor({ id ,fisrtname = '', lastname = '', phonumber ='', email, level = 0, password = '', rol = 'Aprendiz' , status = 'Active' , group = 'onboarding'}) {
        this.id = id;
        this.fisrtname = fisrtname;
        this.lastname = lastname;
        this.phonumber = phonumber;
        this.email = email;
        this.level = level;
        this.password = password;
        this.group = group;
        this.rol = rol;
        this.status = status;
    }

    static create(data) {
        const validation = this.schema.safeParse(data);
        if (!validation.success) {
            throw new Error(validation.error);
        }
        return new User(validation.data); 
    }

    // Método para obtener los datos del usuario
    getUserData() {
        return { ...this };
    }

    static async getAll() {
        const snapshot = await db.collection('users').get();
        const users = [];
        snapshot.forEach(doc => users.push({ id: doc.id, ...doc.data() }));
        return users;
    }

    static async getByEmail(email) {
        const collectionReference = db.collection('users');
        const snapshot = await collectionReference.where('email', '==', email).get();
        if (snapshot.empty) return null;

        const userDocs = [];
        snapshot.forEach(doc => userDocs.push({ id: doc.id, ...doc.data() }));
        return userDocs;
    }

    static async getById(id) {
        const collectionReference = db.collection('users');
        const doc = await collectionReference.doc(id).get();
        if (!doc.exists) return null;
        return { id: doc.id, ...doc.data() };
    }

    static async getByRole(role) {
        const collectionReference = db.collection('users');
        const snapshot = await collectionReference.where('rol', '==', role).get();
        if (snapshot.empty) return [];
        
        // Devuelve solo el id y el nombre
        return snapshot.docs.map(doc => ({
            id: doc.id,
            email: doc.data().email // Asegúrate de usar el campo correcto para el nombre
        }));
    }    

    static async save(user) {
        const collectionReference = db.collection('users');
        const docRef = collectionReference.doc(user.id);
        await docRef.set(user);
        return user;
    }

    static async deleteById(id) {
        await this.collection.doc(id).delete();
        return id;
    }
    
}

module.exports = User;

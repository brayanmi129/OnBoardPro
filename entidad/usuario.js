const { getdb } = require('../api-ext/firebase/firebaseinit.js'); // Importar la instancia de Firestore
const UserSchema = require('../schemas/userSchemas.js'); // Importar la clase User

const db = getdb()

class User {

    static create(data) {
        const validation = UserSchema.schema.safeParse(data);
        if (!validation.success) {
            throw new Error(validation.error);
        }
        return new User(validation.data); 
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

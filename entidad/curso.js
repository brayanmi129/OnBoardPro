const zod = require('zod');
const { getdb } = require('../api-ext/firebase/firebaseinit.js'); // Importar la instancia de Firestore

const db = getdb()

class Course {
    static schema = zod.object({
        id: zod.string().min(1).max(50),
        name: zod.string().min(1).max(50),
        instructor: zod.string().email(),
        grupo: zod.string().min(1).max(50).optional(),
        status: zod.enum(['En curso', 'Cerrado', 'Abierto']).default('Abierto'),
    });

    constructor({ id, name, instructor, grupo, status }) {
        this.id = id;
        this.name = name;
        this.instructor = instructor;
        this.grupo = grupo || 'Sin grupo';
        this.status = status || 'Abierto';
    }

    static async getAll() {
        const snapshot = await db.collection('courses').get();
        const cursos = [];
        snapshot.forEach(doc => cursos.push({ id: doc.id, ...doc.data() }));
        return cursos;
    }

    static async getById(id) {
        const collectionReference = db.collection('courses');
        const doc = await collectionReference.doc(id).get();
        if (!doc.exists) return null;
        return { id: doc.id, ...doc.data() };
    }

    static create(data) {
        const validation = this.schema.safeParse(data);
        if (!validation.success) {
            throw new Error(validation.error);
        }
        return new Course(validation.data);
    }

    static async save(curso) {
        const collectionReference = db.collection('courses');
        const docRef = collectionReference.doc(curso.id);
        await docRef.set(curso);
        return curso;
    }


    getData() {
        return { ...this };
    }
}


module.exports = Course;

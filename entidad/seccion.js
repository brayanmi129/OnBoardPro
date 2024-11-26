const zod = require('zod');
const { getdb } = require('../api-ext/firebase/firebaseinit.js'); // Importar la instancia de Firestore

const db = getdb()

class Seccion {
    // Definir el esquema Zod para validar los datos de usuario
    static schema = zod.object({
        id: zod.string().min(1).max(50),
        IdCourse: zod.string().min(1).max(50),
        name: zod.string().min(1).max(50),
    });

    constructor({ id , IdCourse , name, }) {
        this.id = id;
        this.IdCourse = IdCourse;
        this.name = name;
    }

    static async getAll(req , res) {
        try{
            
        const snapshot = await db.collection('secciones').get();
        const secciones = [];
        snapshot.forEach(doc => secciones.push({ id: doc.id, ...doc.data() }));
        res.status(200).json(secciones);
        }catch(error){
            console.error("Error al obtener las secciones:", error);
            res.status(500).send("Error al obtener las secciones");
        }
    }

    // Método para validar una instancia de usuario usando Zod
    static validate(cursoData) {
        return this.schema.safeParse(cursoData);
    }

    // Método para obtener los datos del usuario
    getData() {
        return {...this};
    }
}

module.exports = Seccion;

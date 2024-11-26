const zod = require('zod');
const { getdb } = require('../api-ext/firebase/firebaseinit.js'); // Importar la instancia de Firestore

const db = getdb()

class Activities {
    static schema = zod.object({
        id: zod.string().min(1).max(50),
        name: zod.string().min(1).max(50),
        id_seccion: zod.string().min(1).max(50),
        description: zod.string().min(1).max(400).optional(),
        adjunto: zod.string().url()
    });

    constructor({ id, name, id_seccion, description, adjunto }) {
        this.id = id;
        this.name = name;
        this.id_seccion = id_seccion;
        this.description = description ;
        this.adjunto = adjunto;
    }

    static async getAll(req , res) {
        try{
            
        const snapshot = await db.collection('activities').get();
        const cursos = [];
        snapshot.forEach(doc => cursos.push({ id: doc.id, ...doc.data() }));
        res.status(200).json(cursos);
        }catch(error){
            console.error("Error al obtener los usuarios:", error);
            res.status(500).send("Error al obtener los usuarios");
        }
    }

    
    getData() {
        return { ...this };
    }

}


module.exports = Activities;

const zod = require('zod');
const { getdb } = require('../api-ext/firebase/firebaseinit.js'); // Importar la instancia de Firestore
const crypto = require('crypto');
const entregableSchema = require('../schemas/entregableSchema.js'); // Importar la clase User
const db = getdb()

class Activities {

    static async getAll(req , res) {
        try{
            
        const snapshot = await db.collection('entregable').get();
        const actividades = [];
        snapshot.forEach(doc => actividades.push({ id: doc.id, ...doc.data() }));
        res.status(200).json(actividades);
        }catch(error){
            console.error("Error al obtener los usuarios:", error);
            res.status(500).send("Error al obtener los usuarios");
        }
    }

    static async create(req, res) {
        try {
            const Data = req.body;
    
            // Generar un ID único para el curso
            const customId = crypto.randomBytes(Math.ceil(10 / 2)).toString('hex').slice(0, 6);
            Data.id = customId;
    
            // Validar y crear la instancia del curso
            const validation = entregableSchema.schema.safeParse(Data);
            if (!validation.success) {
                // Si la validación falla, lanza un error con los detalles
                throw new Error(validation.error.errors.map(err => err.message).join(', '));
            }
    
            // Guardar el curso en la base de datos
            console.log(validation.data)
            const seccion = validation.data;
            const collectionReference = db.collection('activities');
            console.log(seccion.id)
            const docRef = collectionReference.doc(seccion.id);
            await docRef.set(seccion);
    
            res.status(201).json(seccion); // Respuesta con el curso creado
        } catch (error) {
            console.error("Error al crear la actividad:", error.message);
            res.status(400).send(error.message || "Datos inválidos");
        }
    }

}

module.exports = Activities;

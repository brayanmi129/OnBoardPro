const zod = require('zod');
const { getdb } = require('../api-ext/firebase/firebaseinit.js'); // Importar la instancia de Firestore
const crypto = require('crypto');
const entregableSchema = require('../schemas/entregableSchema.js'); // Importar la clase User
const db = getdb()

const multer = require("multer");
const storage = multer.memoryStorage(); // Guardar el archivo en la memoria
const upload = multer({ storage: storage });

class entregable {

    static async getAll(req , res) {
        try{
            
        const snapshot = await db.collection('entregables').get();
        const actividades = [];
        snapshot.forEach(doc => actividades.push({ id: doc.id, ...doc.data() }));
        res.status(200).json(actividades);
        }catch(error){
            console.error("Error al obtener los entregables:", error);
            res.status(500).send("Error al obtener los entregables");
        }
    }

    static async create(req, res) {
        try {
            const Data = req.body;
            console.log(Data);
            // Generar un ID único para la actividad
            const customId = crypto.randomBytes(Math.ceil(10 / 2)).toString("hex").slice(0, 6);
            Data.id = customId;
            // Validación del curso
            const validation = entregableSchema.schema.safeParse(Data);
            if (!validation.success) {
              throw new Error(validation.error.errors.map(err => err.message).join(", "));
            }
      
            // Guardar en Firestore
            const entregable = validation.data;
            console.log(entregable);
            const collectionReference = db.collection("entregables");
            const docRef = collectionReference.doc(entregable.id);
            await docRef.set(entregable);
      
            // Respuesta con la actividad creada
            res.status(201).json(entregable);
          }catch (error) {
          console.error("Error al crear el entregable:", error);
          res.status(400).send(error.message || "Datos inválidos");
        }
      }

}

module.exports = entregable; // Exporta la clase

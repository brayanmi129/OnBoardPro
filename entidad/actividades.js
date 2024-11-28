const zod = require('zod');
const { getdb } = require('../api-ext/firebase/firebaseinit.js'); // Importar la instancia de Firestore
const crypto = require('crypto');
const activitieSchema = require('../schemas/activitieSchema.js'); // Importar la clase User
const db = getdb()
const { uploadFileToDrive } = require('../control/driveController.js');

const multer = require("multer");
const storage = multer.memoryStorage(); // Guardar el archivo en la memoria
const upload = multer({ storage: storage });

class Activities {

    static async getAll(req , res) {
        try{
            
        const snapshot = await db.collection('activities').get();
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
          // Usamos multer para manejar la carga del archivo antes de la lógica de negocio
          upload.single("file")(req, res, async (err) => {
            if (err) {
              return res.status(400).send("Error al cargar el archivo");
            }
            // Aquí ya tienes el archivo cargado en req.file
            
            const file = req.file; // El archivo estará en req.file
            const Data = JSON.parse(req.body.data);
            // Generar un ID único para la actividad
            const customId = crypto.randomBytes(Math.ceil(10 / 2)).toString("hex").slice(0, 6);
            Data.id = customId;
      
            // Subir el archivo a Google Drive
            const fileUrl = await uploadFileToDrive(file.buffer, file.originalname);
      
            // Ahora el Data tiene la URL del archivo en Data.adjunto
            Data.adjunto = fileUrl;
            console.log("Archivo subido a Google Drive:", fileUrl);
            console.log(Data)
      
            // Validación del curso
            const validation = activitieSchema.schema.safeParse(Data);
            if (!validation.success) {
              throw new Error(validation.error.errors.map(err => err.message).join(", "));
            }
      
            // Guardar en Firestore
            const seccion = validation.data;
            const collectionReference = db.collection("activities");
            const docRef = collectionReference.doc(seccion.id);
            await docRef.set(seccion);
      
            // Respuesta con la actividad creada
            res.status(201).json(seccion);
          });
        } catch (error) {
          console.error("Error al crear la actividad:", error.message);
          res.status(400).send(error.message || "Datos inválidos");
        }
      }
}

module.exports = Activities;

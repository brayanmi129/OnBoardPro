const { getdb } = require('../control/firebaseController.js'); // Importar la instancia de Firestore
const db = getdb()
const crypto = require('crypto');
const seccionShecma = require('../schemas/seccionSchema.js');

class Seccion {

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

    static async getActivities(req, res){ //Actividades de una seccion
        
        const {id_seccion} = req.params;
        try{
        const collectionReference = db.collection('activities');
        const snapshot = await collectionReference.where('id_seccion', '==', id_seccion).get();

        if (snapshot.empty) {
            console.log('la seccion no tiene actividades.');
            res.status(404).send("la seccion no tiene actividades.");
        }
    
        // Obtener los IDs de las secciones
        const Ids = snapshot.docs.map(doc => doc.data().id_seccion);
        console.log(Ids)
        // Ahora, obtener los detalles de los cursos
        const Promises = Ids.map(id => 
            db.collection('seccions').doc(id).get()
        );
    
        const Snapshot = await Promise.all(Promises);

        const Data = Snapshot.map(doc => doc.data())
    
        // Mostrar los detalles de los cursos
        res.status(200).send(Data)
        }catch(error){
            console.error("Error al obtener los cursos del usuario:", error);
            res.status(500).send("Error al obtener los cursos del usuario");
        }
    }

    static async create(req, res) {
        try {
            const Data = req.body;
    
            // Generar un ID único para el curso
            const customId = crypto.randomBytes(Math.ceil(10 / 2)).toString('hex').slice(0, 5);
            Data.id = customId;
    
            // Validar y crear la instancia del curso
            const validation = seccionShecma.schema.safeParse(Data);
            if (!validation.success) {
                // Si la validación falla, lanza un error con los detalles
                throw new Error(validation.error.errors.map(err => err.message).join(', '));
            }
    
            // Guardar el curso en la base de datos
            console.log(validation.data)
            const seccion = validation.data;
            const collectionReference = db.collection('seccions');
            console.log(seccion.id)
            const docRef = collectionReference.doc(seccion.id);
            await docRef.set(seccion);
    
            res.status(201).json(seccion); // Respuesta con el curso creado
        } catch (error) {
            console.error("Error al crear el curso:", error.message);
            res.status(400).send(error.message || "Datos inválidos");
        }
    }

    

}

module.exports = Seccion;

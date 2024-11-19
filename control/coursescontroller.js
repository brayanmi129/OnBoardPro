
const crypto = require('crypto');
const { getdb } = require('../api-ext/firebase/firebaseinit.js'); // Importar la instancia de Firestore
const Course = require('../entidad/curso.js'); // Importar la clase User


class CourseController {

    // Método para obtener usuarios
    async getCourses(req, res) {
        const db = getdb(); // Obtener la instancia de Firestore
        try {
            // Obtener todos los documentos de la colección 'users'
            const snapshot = await db.collection('courses').get();
            
            // Crear un arreglo para almacenar los datos de los documentos
            const courses = [];
    
            // Iterar sobre los documentos y agregar sus datos al arreglo
            snapshot.forEach(doc => {
                courses.push({ id: doc.id, ...doc.data() });
            });
    
            // Enviar la respuesta con los datos
            res.status(200).send(courses);
        } catch (error) {
            console.error("Error al obtener los usuarios: ", error);
            res.status(500).send("Error al obtener los usuarios");
        }
    }

    async searchUserById(id) {
    
        const db = getdb();
        const collectionReference = db.collection('courses');
    
        try {
            const doc = await collectionReference.doc(id).get();
    
            if (!doc.exists) {
                console.log('No matching document with ID:', id);
            }
    
            const userData = {
                id: doc.id, // ID del documento
                ...doc.data() // Datos del documento
            };
    
            return userData; // Retorna el objeto con los datos del usuario
        } catch (error) {
            console.error("Error al obtener el curso con ID", id, error);
        
        }
    }

    async searchUserByIdByRequest(req, res) {
        const id = req.params.id; // ID del documento a buscar
    
        const db = getdb();
        const collectionReference = db.collection('courses');
    
        try {
            const doc = await collectionReference.doc(id).get();
    
            if (!doc.exists) {
                console.log('No matching document with ID:', id);
                return res.status(404).send('No matching document with ID: ' + id);
            }
    
            const userData = {
                id: doc.id, // ID del documento
                ...doc.data() // Datos del documento
            };
    
            res.status(200).send(userData); // Retorna el objeto con los datos del usuario
        } catch (error) {
            console.error("Error al obtener el usuario con ID", id, error);
            res.status(500).send('Error al obtener el usuario con ID: ' + id);
        }
    }

    async createCourseByRequest(req, res) {
        const coursedata = req.body;
    
        // Generar un ID único
        const customId = crypto.randomBytes(3).toString('hex'); // 6 caracteres hexadecimales
        console.log('ID generado:', customId);
    
        try {
            const db = getdb();
            const collectionReference = db.collection('courses');
    
            // Crear y validar el curso
            const newCourse = Course.create({
                id: customId,
                ...coursedata, // Mapea automáticamente los campos del cuerpo de la solicitud
            });
    
            // Guardar en Firestore
            const docRef = collectionReference.doc(newCourse.id);
            await docRef.set(newCourse.getCourseData());
    
            console.log('Curso creado con ID:', docRef.id);
            res.status(200).send(newCourse.getCourseData());
        } catch (error) {
            console.error('Error al crear el curso:', error);
            res.status(500).send('Error al crear el curso');
        }
    }
    
    
}

module.exports = new CourseController();

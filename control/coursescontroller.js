
const { getdb } = require('../api-ext/firebase/firebaseinit.js'); // Importar la instancia de Firestore

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
}

module.exports = new CourseController();

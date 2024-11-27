const crypto = require('crypto');
const { getdb } = require('../api-ext/firebase/firebaseinit.js'); // Importar la instancia de Firestore
const shcemaCourse = require('../schemas/cursoSchemas.js'); // Importar la clase User

const db = getdb()
 
class Course {
    static async getAll(req , res) {
        try{
            
        const snapshot = await db.collection('courses').get();
        const cursos = [];
        snapshot.forEach(doc => cursos.push({ id: doc.id, ...doc.data() }));
        res.status(200).json(cursos);
        }catch(error){
            console.error("Error al obtener los usuarios:", error);
            res.status(500).send("Error al obtener los usuarios");
        }
    }

    static async getById(req, res) {
        const { id } = req.params;
        try{
        const collectionReference = db.collection('courses');
        const doc = await collectionReference.doc(id).get();
        if (!doc.exists) return null;
        const course = { id: doc.id, ...doc.data() };
        res.status(200).json(course);
        }catch (error) {
            console.error("Error al buscar usuario por email:", error);
            res.status(500).send("Error interno");
        }
    }

    static async createCourse(req, res) {
        try {
            const courseData = req.body;
    
            // Generar un ID único para el curso
            const customId = crypto.randomBytes(Math.ceil(10 / 2)).toString('hex').slice(0, 6);
            courseData.id = customId;
    
            // Validar y crear la instancia del curso
            const validation = shcemaCourse.schema.safeParse(courseData);
            if (!validation.success) {
                // Si la validación falla, lanza un error con los detalles
                throw new Error(validation.error.errors.map(err => err.message).join(', '));
            }
    
            // Guardar el curso en la base de datos
            console.log(validation.data)
            const course = validation.data;
            const collectionReference = db.collection('courses');
            console.log(course.id)
            const docRef = collectionReference.doc(course.id);
            await docRef.set(course);
    
            res.status(201).json(course); // Respuesta con el curso creado
        } catch (error) {
            console.error("Error al crear el curso:", error.message);
            res.status(400).send(error.message || "Datos inválidos");
        }
    }

    static async getUserCourses(req, res){
        
        const {id_user} = req.params;
        try{
        const collectionReference = db.collection('users_courses');
        const snapshot = await collectionReference.where('id_user', '==', id_user).get();

        if (snapshot.empty) {
            console.log('Este usuario no está inscrito en ningún curso.');
            res.status(404).send("Este usuario no está inscrito en ningún curso.");
        }
    
        // Obtener los IDs de los cursos
        const courseIds = snapshot.docs.map(doc => doc.data().id_course);
    
        // Ahora, obtener los detalles de los cursos
        const coursesPromises = courseIds.map(courseId => 
            db.collection('courses').doc(courseId).get()
        );
    
        const coursesSnapshot = await Promise.all(coursesPromises);

        const coursesData = coursesSnapshot.map(doc => doc.data())
    
        // Mostrar los detalles de los cursos
        res.status(200).send(coursesData)
        }catch(error){
            console.error("Error al obtener los cursos del usuario:", error);
            res.status(500).send("Error al obtener los cursos del usuario");
        }
    }

    static async getCoursesUsers(req , res){
        const { id_course } = req.params;
        try{
        const collectionReference = db.collection('users_courses');
    
        const snapshot = await collectionReference.where('id_course', '==', id_course).get();
  
        if (snapshot.empty) {
            console.log('Este usuario no está inscrito en ningún curso.');
            res.status(404).send("Este usuario no está inscrito en ningún curso.");
        }
    
        // Obtener los IDs de los cursos
        const usersIds = snapshot.docs.map(doc => doc.data().id_user);
    
        // Ahora, obtener los detalles de los usuarios
        const usersPromises = usersIds.map(usersId => 
            db.collection('users').doc(usersId).get()
        );
    
        const usersSnapshot = await Promise.all(usersPromises);

        const usersData = usersSnapshot.map(doc => doc.data().email)
    
        // Mostrar los detalles de los cursos
        res.status(200).send(usersData)
    }catch(error){
        console.error("Error al obtener los usuarios del curso:", error);
        res.status(500).send("Error al obtener los usuarios del curso");
        }
    }

    static async getSeccions(req , res){
        try{
            const { id_course } = req.params
            const collectionReference = db.collection('secciones');
        
            const snapshot = await collectionReference.where('id_course', '==', id_course).get();
      
            if (snapshot.empty) {
                console.log('No hay secciones para este curso.');
                return;
            }
        
            // Obtener los IDs de las secciones
            const seccionesIds = snapshot.docs.map(doc => doc.data().id);
            console.log(seccionesIds)
        
            // Ahora, obtener los detalles de los usuarios
            const seccionsPromises = seccionesIds.map(id => 
                db.collection('secciones').doc(id).get()
            );
        
            const seccionsSnapshot = await Promise.all(seccionsPromises);
    
            const seccionsData = seccionsSnapshot.map(doc => doc.data())
        
            // Mostrar los detalles de los cursos
            res.status(200).send(seccionsData)
        }catch(error){
            console.error("Error al obtener las secciones del curso:", error);
            res.status(500).send("Error al obtener las secciones del curso");
        }
        
    }
}

module.exports = Course;

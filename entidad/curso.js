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

    static async getUserCourses(id){
        const collectionReference = db.collection('users_courses');
        const snapshot = await collectionReference.where('id_user', '==', id).get();

        if (snapshot.empty) {
            console.log('Este usuario no está inscrito en ningún curso.');
            return;
        }
    
        // Obtener los IDs de los cursos
        const courseIds = snapshot.docs.map(doc => doc.data().id_course);
        console.log(courseIds)
    
        // Ahora, obtener los detalles de los cursos
        const coursesPromises = courseIds.map(courseId => 
            db.collection('courses').doc(courseId).get()
        );
    
        const coursesSnapshot = await Promise.all(coursesPromises);

        const coursesData = coursesSnapshot.map(doc => doc.data())
    
        // Mostrar los detalles de los cursos
        return coursesData
    }

    static async getCoursesUsers(id){
        const collectionReference = db.collection('users_courses');
    
        const snapshot = await collectionReference.where('id_course', '==', id).get();
  
        if (snapshot.empty) {
            console.log('Este usuario no está inscrito en ningún curso.');
            return;
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
        return usersData
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
    
    getData() {
        return { ...this };
    }

}


module.exports = Course;

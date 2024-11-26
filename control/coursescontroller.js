
const crypto = require('crypto');
const { getdb } = require('../api-ext/firebase/firebaseinit.js'); // Importar la instancia de Firestore
const Course = require('../entidad/curso.js'); // Importar la clase User


class CourseController {

    // Método para obtener usuarios
    async fetchAllCourses(req, res) {
        try {
            const courses = await Course.getAll();
            res.status(200).json(courses);
        } catch (error) {
            console.error("Error al obtener los usuarios:", error);
            res.status(500).send("Error al obtener los usuarios");
        }
    }

    async fetchCoursesById(req, res) {
        try {
            const { id } = req.params;
            const user = await Course.getById(id);
            if (!user) return res.status(404).send("Usuario no encontrado");
            res.status(200).json(user);
        } catch (error) {
            console.error("Error al buscar usuario por email:", error);
            res.status(500).send("Error interno");
        }
    }

    async createCourse(req, res) {
        try {
            const courseData = req.body;
            let customId = crypto.randomBytes(Math.ceil(10 / 2)).toString('hex').slice(0, 6);
            courseData.id = customId
            const course = Course.create(courseData);
            const savedCourse = await Course.save(course.getData());
            res.status(201).json(savedCourse);
        } catch (error) {
            console.error("Error al crear el usuario:", error);
            res.status(400).send(error.message || "Datos inválidos");
        }
    }
    
    
}

module.exports = new CourseController();

const CourseService = require("../services/courseService.js");
const zod = require("zod");

// El tenant sale del JWT, no del body. El superadmin usa null: sin filtro.
function tenantDe(req) {
  return req.user.role === "superadmin" ? null : req.user.tenantId;
}

class CourseController {
  // Crear curso
  static async create(req, res) {
    try {
      const tenantId =
        req.user.role === "superadmin" ? req.body.tenantId || null : req.user.tenantId;
      const course = await CourseService.createCourse({ ...req.body, tenantId });
      res.status(201).json(course);
    } catch (error) {
      console.error("Error al crear el curso:", error.message);
      if (error instanceof zod.ZodError) {
        res.status(400).json({ error: "Datos inválidos", details: error.errors });
      } else {
        res.status(500).json({ error: error.message });
      }
    }
  }

  // Obtener todos los cursos
  static async getAll(req, res) {
    try {
      const courses = await CourseService.getAll(tenantDe(req));
      res.status(200).json(courses);
    } catch (error) {
      console.error("Error al obtener los cursos:", error);
      res.status(500).send("Error al obtener los cursos");
    }
  }

  // Obtener curso por ID
  static async getById(req, res) {
    try {
      const { id } = req.params;
      const course = await CourseService.getById(id, tenantDe(req));
      if (!course) return res.status(404).send("Curso no encontrado");
      res.status(200).json(course);
    } catch (error) {
      console.error("Error al buscar curso por ID:", error);
      res.status(500).send("Error interno");
    }
  }

  //mis cursos
  static async getMyCourses(req, res) {
    try {
      const id = req.user.id;
      const courses = await CourseService.getByUser(id);
      res.status(200).json(courses);
    } catch (error) {
      console.error("Error al obtener los cursos del usuario:", error);
      res.status(500).send("Error al obtener los cursos del usuario");
    }
  }
}

module.exports = CourseController;

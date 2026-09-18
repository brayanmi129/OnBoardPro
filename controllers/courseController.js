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
      // Un fallo de validación llega con status 400 y el nombre del campo;
      // cualquier otra cosa es un problema del servidor.
      return res
        .status(error.status || 500)
        .json({ error: error.message, ...(error.campos ? { campos: error.campos } : {}) });
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

  // Portada del curso
  static async subirBanner(req, res) {
    try {
      if (!req.file) return res.status(400).json({ message: "No se recibió ninguna imagen." });
      const r = await CourseService.guardarBanner(req.params.id, tenantDe(req), req.file);
      if (r.error) return res.status(r.error === "Curso no encontrado" ? 404 : 400).json(r);
      return res.status(200).json(r);
    } catch (error) {
      console.error("Error al subir la portada:", error.message);
      return res.status(500).json({ message: error.message });
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

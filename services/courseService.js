const crypto = require("crypto");
const { db } = require("../helpers/firebaseHelper.js");
const CourseSchema = require("../schemas/courseSchemas.js");

class CourseService {
  // Obtener todos los cursos
  static async getAll() {
    const snapshot = await db.collection("courses").get();
    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  }

  // Obtener curso por ID
  static async getById(id) {
    const doc = await db.collection("courses").doc(id).get();
    if (!doc.exists) return null;
    return { id: doc.id, ...doc.data() };
  }

  // Crear curso
  static async createCourse(courseData) {
    const customId = crypto.randomBytes(3).toString("hex");
    courseData.id = customId;

    const validation = CourseSchema.schema.safeParse(courseData);
    if (!validation.success) {
      throw new Error(validation.error.errors.map((err) => err.message).join(", "));
    }

    const course = validation.data;
    await db.collection("courses").doc(course.id).set(course);
    return course;
  }
}

module.exports = CourseService;

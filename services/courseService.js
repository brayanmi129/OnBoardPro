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

  static async getByUser(userId) {
    // 1️⃣ Buscar los grupos del usuario
    const userGroupsSnap = await db.collection("users_groups").where("id_user", "==", userId).get();

    if (userGroupsSnap.empty) return [];

    const groupIds = userGroupsSnap.docs.map((doc) => doc.data().id_group);

    // 2️⃣ Buscar los cursos asociados a esos grupos
    const groupCoursesSnaps = await Promise.all(
      groupIds.map((gid) => db.collection("groups_courses").where("id_group", "==", gid).get())
    );

    const courseIds = groupCoursesSnaps.flatMap((snap) =>
      snap.docs.map((doc) => doc.data().id_course)
    );

    const uniqueCourseIds = [...new Set(courseIds)];

    if (uniqueCourseIds.length === 0) return [];

    // 3️⃣ Obtener la información de cada curso
    const courseDocs = await Promise.all(
      uniqueCourseIds.map(async (cid) => {
        const courseDoc = await db.collection("courses").doc(cid).get();
        if (!courseDoc.exists) return null;
        return { id: courseDoc.id, ...courseDoc.data() };
      })
    );

    return courseDocs.filter((c) => c !== null);
  }
}

module.exports = CourseService;

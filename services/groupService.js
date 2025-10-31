// services/groupService.js
const { getdb } = require("../helpers/firebaseHelper.js");
const GroupSchema = require("../schemas/groupSchema.js");
const crypto = require("crypto");

const db = getdb();

class GroupService {
  // ✅ Crear un grupo y opcionalmente asignar usuarios
  static async create(groupData) {
    const customId = crypto.randomBytes(3).toString("hex");
    groupData.id = customId;

    // Validar datos del grupo
    const validation = GroupSchema.schema.safeParse(groupData);
    if (!validation.success) {
      const errorMessages = validation.error.errors.map((err) => err.message);
      throw new Error(errorMessages.join(", "));
    }

    const group = validation.data;
    await db.collection("groups").doc(group.id).set(group);

    // 🔗 Si se incluyen usuarios al crearlo
    if (Array.isArray(groupData.userIds) && groupData.userIds.length > 0) {
      const batch = db.batch();
      groupData.userIds.forEach((userId) => {
        const relRef = db.collection("users_groups").doc();
        batch.set(relRef, { id_user: userId, id_group: group.id });
      });
      await batch.commit();
    }

    return group;
  }

  static async getAll() {
    const snapshot = await db.collection("groups").get();
    const groups = [];

    for (const doc of snapshot.docs) {
      const group = { id: doc.id, ...doc.data() };

      // --- 🔹 Buscar usuarios del grupo ---
      const userGroupSnap = await db
        .collection("users_groups")
        .where("id_group", "==", group.id)
        .get();

      const userIds = userGroupSnap.docs.map((d) => d.data().id_user);

      const userDocs = await Promise.all(
        userIds.map((uid) => db.collection("users").doc(uid).get())
      );

      group.users = userDocs
        .filter((u) => u.exists)
        .map((u) => ({
          id: u.id,
          firstname: u.data().firstname,
          lastname: u.data().lastname,
          email: u.data().email,
          role: u.data().role,
        }));

      const groupCoursesSnap = await db
        .collection("groups_courses")
        .where("id_group", "==", group.id)
        .get();

      const courseIds = groupCoursesSnap.docs.map((gc) => gc.data().id_course);

      const courseDocs = await Promise.all(
        courseIds.map((cid) => db.collection("courses").doc(cid).get())
      );

      group.courses = courseDocs.filter((c) => c.exists).map((c) => ({ id: c.id, ...c.data() }));

      groups.push(group);
    }

    return groups;
  }

  // ✅ Obtener un grupo por ID con usuarios y cursos incluidos
  static async getById(id) {
    const doc = await db.collection("groups").doc(id).get();
    if (!doc.exists) return null;

    const group = { id: doc.id, ...doc.data() };

    // --- 🔹 Buscar usuarios relacionados ---
    const userGroupSnap = await db.collection("users_groups").where("id_group", "==", id).get();
    const userIds = userGroupSnap.docs.map((d) => d.data().id_user);

    const userDocs = await Promise.all(userIds.map((uid) => db.collection("users").doc(uid).get()));

    group.users = userDocs
      .filter((u) => u.exists)
      .map((u) => ({
        id: u.id,
        firstname: u.data().firstname,
        lastname: u.data().lastname,
        email: u.data().email,
        role: u.data().role,
      }));

    // --- 🔹 Buscar cursos del grupo (groups_courses) ---
    const groupCoursesSnap = await db
      .collection("groups_courses")
      .where("id_group", "==", id)
      .get();

    const courseIds = groupCoursesSnap.docs.map((gc) => gc.data().id_course);

    const courseDocs = await Promise.all(
      courseIds.map((cid) => db.collection("courses").doc(cid).get())
    );

    group.courses = courseDocs.filter((c) => c.exists).map((c) => ({ id: c.id, ...c.data() }));

    return group;
  }

  // ✅ Asignar usuarios a un grupo ya existente
  static async addUsersToGroup(groupId, userIds) {
    const groupDoc = await db.collection("groups").doc(groupId).get();
    if (!groupDoc.exists) throw new Error("Grupo no encontrado");

    const batch = db.batch();
    userIds.forEach((userId) => {
      const relRef = db.collection("users_groups").doc();
      batch.set(relRef, { id_user: userId, id_group: groupId });
    });

    await batch.commit();
    return { message: "Usuarios agregados al grupo correctamente" };
  }

  // ✅ Actualizar grupo
  static async updateGroup(id, updateData) {
    console.log("Actualizando grupo con ID:", id);
    const groupDoc = await db.collection("groups").doc(id).get();
    if (!groupDoc.exists) return { error: "Grupo no encontrado" };

    const validation = GroupSchema.schema.partial().safeParse(updateData);
    if (!validation.success) {
      const errorMessages = validation.error.errors.map((err) => err.message);
      return { error: "Datos inválidos", details: errorMessages };
    }

    const validatedUpdate = validation.data;
    await db.collection("groups").doc(id).update(validatedUpdate);

    console.log(`Grupo ${id} actualizado correctamente`);
    return {
      message: `Grupo ${id} actualizado correctamente`,
      updatedData: validatedUpdate,
    };
  }

  // ✅ Eliminar grupo y sus relaciones
  static async deleteGroup(id) {
    console.log("Eliminando grupo con ID:", id);
    const groupDoc = await db.collection("groups").doc(id).get();
    if (!groupDoc.exists) throw new Error("Grupo no encontrado");

    // Eliminar relaciones users_groups
    const relSnap = await db.collection("users_groups").where("id_group", "==", id).get();
    const batch = db.batch();
    relSnap.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();

    // Eliminar relaciones groups_courses
    const groupCoursesSnap = await db
      .collection("groups_courses")
      .where("id_group", "==", id)
      .get();
    const batch2 = db.batch();
    groupCoursesSnap.forEach((doc) => batch2.delete(doc.ref));
    await batch2.commit();

    // Eliminar grupo
    await db.collection("groups").doc(id).delete();
    return id;
  }
}

module.exports = GroupService;

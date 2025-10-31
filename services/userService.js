// services/userService.js
const { getdb } = require("../helpers/firebaseHelper.js");
const UserSchema = require("../schemas/userSchemas.js");
const crypto = require("crypto");

const db = getdb();

class UserService {
  static async create(userData) {
    const customId = crypto.randomBytes(3).toString("hex");
    userData.id = customId;

    const validation = UserSchema.schema.safeParse(userData);
    if (!validation.success) {
      const errorMessages = validation.error.errors.map((err) => err.message);
      throw new Error(errorMessages.join(", "));
    }

    const user = validation.data;
    await db.collection("users").doc(user.id).set(user);
    return user;
  }

  static async getAll() {
    const snapshot = await db.collection("users").get();
    const users = [];

    for (const doc of snapshot.docs) {
      const user = { id: doc.id, ...doc.data() };
      delete user.password;

      // --- GRUPOS ---
      const relGroupsSnap = await db
        .collection("users_groups")
        .where("id_user", "==", doc.id)
        .get();

      const groupIds = relGroupsSnap.docs.map((relDoc) => relDoc.data().id_group);

      // --- DATOS DE LOS GRUPOS ---
      const groupDocs = await Promise.all(
        groupIds.map(async (gid) => {
          const groupDoc = await db.collection("groups").doc(gid).get();
          if (!groupDoc.exists) return null;
          return { id: groupDoc.id, ...groupDoc.data() };
        })
      );
      user.groups = groupDocs.filter((g) => g !== null);

      // --- CURSOS POR GRUPOS ---
      const groupCoursesSnaps = await Promise.all(
        groupIds.map((gid) => db.collection("groups_courses").where("id_group", "==", gid).get())
      );

      const courseIds = groupCoursesSnaps.flatMap((snap) =>
        snap.docs.map((gc) => gc.data().id_course)
      );

      const courseDocs = await Promise.all(
        [...new Set(courseIds)].map(async (cid) => {
          const courseDoc = await db.collection("courses").doc(cid).get();
          if (!courseDoc.exists) return null;
          return { id: courseDoc.id, ...courseDoc.data() };
        })
      );
      user.courses = courseDocs.filter((c) => c !== null);

      users.push(user);
    }

    return users;
  }

  static async getById(id) {
    const userDoc = await db.collection("users").doc(id).get();
    if (!userDoc.exists) return null;

    const user = { id: userDoc.id, ...userDoc.data() };
    delete user.password;

    // --- GRUPOS ---
    const relGroupsSnap = await db.collection("users_groups").where("id_user", "==", id).get();

    const groupIds = relGroupsSnap.docs.map((relDoc) => relDoc.data().id_group);

    const groupDocs = await Promise.all(
      groupIds.map(async (gid) => {
        const groupDoc = await db.collection("groups").doc(gid).get();
        if (!groupDoc.exists) return null;
        return { id: groupDoc.id, ...groupDoc.data() };
      })
    );
    user.groups = groupDocs.filter((g) => g !== null);

    // --- CURSOS POR GRUPOS ---
    const groupCoursesSnaps = await Promise.all(
      groupIds.map((gid) => db.collection("groups_courses").where("id_group", "==", gid).get())
    );

    const courseIds = groupCoursesSnaps.flatMap((snap) =>
      snap.docs.map((gc) => gc.data().id_course)
    );

    const courseDocs = await Promise.all(
      [...new Set(courseIds)].map(async (cid) => {
        const courseDoc = await db.collection("courses").doc(cid).get();
        if (!courseDoc.exists) return null;
        return { id: courseDoc.id, ...courseDoc.data() };
      })
    );
    user.courses = courseDocs.filter((c) => c !== null);

    return user;
  }

  static async getByEmail(email) {
    const snapshot = await db.collection("users").where("email", "==", email).get();
    if (snapshot.empty) return [];

    const users = [];

    for (const doc of snapshot.docs) {
      const user = { id: doc.id, ...doc.data() };
      delete user.password;

      // --- GRUPOS ---
      const relGroupsSnap = await db
        .collection("users_groups")
        .where("id_user", "==", user.id)
        .get();

      const groupIds = relGroupsSnap.docs.map((relDoc) => relDoc.data().id_group);

      const groupDocs = await Promise.all(
        groupIds.map(async (gid) => {
          const groupDoc = await db.collection("groups").doc(gid).get();
          if (!groupDoc.exists) return null;
          return { id: groupDoc.id, ...groupDoc.data() };
        })
      );
      user.groups = groupDocs.filter((g) => g !== null);

      // --- CURSOS POR GRUPOS ---
      const groupCoursesSnaps = await Promise.all(
        groupIds.map((gid) => db.collection("groups_courses").where("id_group", "==", gid).get())
      );

      const courseIds = groupCoursesSnaps.flatMap((snap) =>
        snap.docs.map((gc) => gc.data().id_course)
      );

      const courseDocs = await Promise.all(
        [...new Set(courseIds)].map(async (cid) => {
          const courseDoc = await db.collection("courses").doc(cid).get();
          if (!courseDoc.exists) return null;
          return { id: courseDoc.id, ...courseDoc.data() };
        })
      );
      user.courses = courseDocs.filter((c) => c !== null);

      users.push(user);
    }

    return users;
  }

  static async getByRole(role) {
    const snapshot = await db.collection("users").where("role", "==", role).get();
    if (snapshot.empty) return [];

    const users = [];

    for (const doc of snapshot.docs) {
      const user = { id: doc.id, ...doc.data() };
      delete user.password;

      // --- GRUPOS ---
      const relGroupsSnap = await db
        .collection("users_groups")
        .where("id_user", "==", user.id)
        .get();

      const groupIds = relGroupsSnap.docs.map((relDoc) => relDoc.data().id_group);

      const groupDocs = await Promise.all(
        groupIds.map(async (gid) => {
          const groupDoc = await db.collection("groups").doc(gid).get();
          if (!groupDoc.exists) return null;
          return { id: groupDoc.id, ...groupDoc.data() };
        })
      );
      user.groups = groupDocs.filter((g) => g !== null);

      // --- CURSOS POR GRUPOS ---
      const groupCoursesSnaps = await Promise.all(
        groupIds.map((gid) => db.collection("groups_courses").where("id_group", "==", gid).get())
      );

      const courseIds = groupCoursesSnaps.flatMap((snap) =>
        snap.docs.map((gc) => gc.data().id_course)
      );

      const courseDocs = await Promise.all(
        [...new Set(courseIds)].map(async (cid) => {
          const courseDoc = await db.collection("courses").doc(cid).get();
          if (!courseDoc.exists) return null;
          return { id: courseDoc.id, ...courseDoc.data() };
        })
      );
      user.courses = courseDocs.filter((c) => c !== null);

      users.push(user);
    }

    return users;
  }

  static async deleteUser(id) {
    const userDoc = await db.collection("users").doc(id).get();
    if (!userDoc.exists) throw new Error("Usuario no encontrado");

    await db.collection("users").doc(id).delete();
    return id;
  }

  static async updateUser(id, updateData) {
    const userDoc = await db.collection("users").doc(id).get();
    if (!userDoc.exists) return { error: "Usuario no encontrado" };

    const validation = UserSchema.schema.partial().safeParse(updateData);
    if (!validation.success) {
      const errorMessages = validation.error.errors.map((err) => err.message);
      return { error: "Datos inválidos", details: errorMessages };
    }

    const validatedUpdate = validation.data;
    await db.collection("users").doc(id).update(validatedUpdate);

    return {
      message: `Usuario ${id} actualizado correctamente`,
      updatedData: validatedUpdate,
    };
  }
}

module.exports = UserService;

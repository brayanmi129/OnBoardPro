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
    snapshot.forEach((doc) => users.push({ id: doc.id, ...doc.data() }));
    users.forEach((u) => delete u.password);
    return users;
  }

  static async getByEmail(email) {
    const snapshot = await db.collection("users").where("email", "==", email).get();
    if (snapshot.empty) return [];
    const users = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
    users.forEach((u) => delete u.password);
    return users;
  }

  static async getById(id) {
    const doc = await db.collection("users").doc(id).get();
    if (!doc.exists) return null;
    const user = { id: doc.id, ...doc.data() };
    delete user.password;
    return user;
  }

  static async getByRole(rol) {
    const snapshot = await db.collection("users").where("rol", "==", rol).get();
    if (snapshot.empty) return [];
    return snapshot.docs.map((doc) => ({
      id: doc.id,
      email: doc.data().email,
    }));
  }

  static async getUserCourses(id_user) {
    const snapshot = await db.collection("users_courses").where("id_user", "==", id_user).get();
    if (snapshot.empty) return [];

    const courseIds = snapshot.docs.map((doc) => doc.data().id_course);
    const coursesSnapshot = await Promise.all(
      courseIds.map((id) => db.collection("courses").doc(id).get())
    );

    return coursesSnapshot.map((doc) => doc.data());
  }

  static async deleteUser(id) {
    console.log("Eliminando usuario con ID:", id);
    const userDoc = await db.collection("users").doc(id).get();
    if (!userDoc.exists) throw new Error("Usuario no encontrado");
    await db.collection("users").doc(id).delete();
    return id;
  }

  static async updateUser(id, updateData) {
    console.log("Actualizando usuario con ID:", id);
    const userDoc = await db.collection("users").doc(id).get();
    if (!userDoc.exists) return { error: "Usuario no encontrado" };

    // ✅ Validación con safeParse (en lugar de parse)
    const validation = UserSchema.schema.partial().safeParse(updateData);
    if (!validation.success) {
      const errorMessages = validation.error.errors.map((err) => err.message);
      return { error: "Datos inválidos", details: errorMessages };
    }

    const validatedUpdate = validation.data;
    await db.collection("users").doc(id).update(validatedUpdate);

    console.log(`Usuario ${id} actualizado correctamente`);
    return {
      message: `Usuario ${id} actualizado correctamente`,
      updatedData: validatedUpdate,
    };
  }
}

module.exports = UserService;

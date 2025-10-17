const { getdb } = require("../controllers/firebaseController.js"); // Importar la instancia de Firestore
const UserSchema = require("../schemas/userSchemas.js"); // Importar la clase User
const crypto = require("crypto");
const db = getdb();

class User {
  static async create(req, res) {
    try {
      const userData = req.body;

      // Generar un ID único para
      const customId = crypto
        .randomBytes(Math.ceil(10 / 2))
        .toString("hex")
        .slice(0, 6);
      userData.id = customId;

      // Validar y crear la instancia
      const validation = UserSchema.schema.safeParse(userData);
      if (!validation.success) {
        // Si la validación falla, lanza un error con los detalles
        throw new Error(validation.error.errors.map((err) => err.message).join(", "));
      }

      // Guardar el curso en la base de datos
      console.log(validation.data);
      const user = validation.data;
      const collectionReference = db.collection("users");
      console.log(user.id);
      const docRef = collectionReference.doc(user.id);
      await docRef.set(user);

      res.status(201).json(user); // Respuesta con el curso creado
    } catch (error) {
      console.error("Error al crear el curso:", error.message);
      res.status(400).send(error.message || "Datos inválidos");
    }
  }

  static async create2(userData) {
    try {
      // Generar un ID único para el curso
      const customId = crypto
        .randomBytes(Math.ceil(10 / 2))
        .toString("hex")
        .slice(0, 6);
      userData.id = customId;

      // Validar y crear la instancia del curso
      const validation = UserSchema.schema.safeParse(userData);
      if (!validation.success) {
        // Si la validación falla, lanza un error con los detalles
        throw new Error(validation.error.errors.map((err) => err.message).join(", "));
      }

      // Guardar el curso en la base de datos
      console.log(validation.data);
      const user = validation.data;
      const collectionReference = db.collection("users");
      console.log(user.id);
      const docRef = collectionReference.doc(user.id);
      await docRef.set(user);

      return user; // Respuesta con el curso creado
    } catch (error) {
      return error.message || "Datos inválidos";
    }
  }

  static async getAll(req, res) {
    try {
      const snapshot = await db.collection("users").get();
      const users = [];
      snapshot.forEach((doc) => users.push({ id: doc.id, ...doc.data() }));
      users.forEach((user) => delete user.password);
      res.status(200).json(users);
    } catch (error) {
      console.error("Error al obtener los usuarios:", error);
      res.status(500).send("Error al obtener los usuarios");
    }
  }

  static async getByEmail(req, res) {
    try {
      const { email } = req.params;
      const collectionReference = db.collection("users");
      const snapshot = await collectionReference.where("email", "==", email).get();
      if (snapshot.empty) return res.status(404).send("Usuario no encontrado");

      const userDocs = [];
      snapshot.forEach((doc) => userDocs.push({ id: doc.id, ...doc.data() }));
      userDocs.forEach((user) => delete user.password);
      res.status(200).json(userDocs);
    } catch (error) {
      console.error("Error al buscar usuario por email:", error);
      res.status(500).send("Error interno");
    }
  }

  static async getById(req, res) {
    try {
      const { id } = req.params;
      const collectionReference = db.collection("users");
      const doc = await collectionReference.doc(id).get();
      if (!doc.exists) return res.status(404).send("Usuario no encontrado");
      const user = { id: doc.id, ...doc.data() };
      delete user.password;
      res.status(200).json(user);
    } catch (error) {
      console.error("Error al buscar usuario por email:", error);
      res.status(500).send("Error interno");
    }
  }

  static async getByRole(req, res) {
    try {
      const { rol } = req.params;
      const collectionReference = db.collection("users");
      const snapshot = await collectionReference.where("rol", "==", rol).get();
      if (snapshot.empty) return [];

      // Devuelve solo el id y el nombre
      const users = snapshot.docs.map((doc) => ({
        id: doc.id,
        email: doc.data().email, // Asegúrate de usar el campo correcto para el nombre
      }));
      res.status(200).json(users);
    } catch (error) {
      console.error("Error al buscar usuario por rol:", error);
      res.status(500).send("Error interno");
    }
  }

  static async getUserCourses(req, res) {
    //Cursos De un usuario

    const { id_user } = req.params;
    try {
      const collectionReference = db.collection("users_courses");
      const snapshot = await collectionReference.where("id_user", "==", id_user).get();

      if (snapshot.empty) {
        console.log("Este usuario no está inscrito en ningún curso.");
        res.status(404).send("Este usuario no está inscrito en ningún curso.");
      }

      // Obtener los IDs de los cursos
      const courseIds = snapshot.docs.map((doc) => doc.data().id_course);

      // Ahora, obtener los detalles de los cursos
      const coursesPromises = courseIds.map((courseId) =>
        db.collection("courses").doc(courseId).get()
      );

      const coursesSnapshot = await Promise.all(coursesPromises);

      const coursesData = coursesSnapshot.map((doc) => doc.data());

      // Mostrar los detalles de los cursos
      res.status(200).send(coursesData);
    } catch (error) {
      console.error("Error al obtener los cursos del usuario:", error);
      res.status(500).send("Error al obtener los cursos del usuario");
    }
  }

  static async deleteById(id) {
    await this.collection.doc(id).delete();
    return id;
  }
}

module.exports = User;

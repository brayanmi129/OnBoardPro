const crypto = require("crypto");
const { getdb } = require("../helpers/firebaseHelper.js");
const { uploadFileToDrive } = require("../helpers/driveController.js");
const activitieSchema = require("../schemas/activitieSchema.js");

const db = getdb();

class ActivitiesService {
  static async getAll() {
    const snapshot = await db.collection("activities").get();
    const activities = [];
    snapshot.forEach((doc) => activities.push({ id: doc.id, ...doc.data() }));
    return activities;
  }

  static async create(data, file) {
    // Generar un ID único
    const customId = crypto.randomBytes(3).toString("hex");
    data.id = customId;

    // Subir archivo a Drive (si existe)
    if (file) {
      const fileUrl = await uploadFileToDrive(file.buffer, file.originalname);
      data.adjunto = fileUrl;
      console.log("Archivo subido a Google Drive:", fileUrl);
    }

    // Validar datos
    const validation = activitieSchema.schema.safeParse(data);
    if (!validation.success) {
      throw new Error(validation.error.errors.map((err) => err.message).join(", "));
    }

    // Guardar en Firestore
    const collection = db.collection("activities");
    await collection.doc(data.id).set(validation.data);

    return validation.data;
  }
}

module.exports = ActivitiesService;

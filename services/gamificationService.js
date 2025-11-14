const crypto = require("crypto");
const { db } = require("../helpers/firebaseHelper.js");
const CourseSchema = require("../schemas/courseSchemas.js");

class gamificationService {
  static async getRanking() {
    const snapshot = await db.collection("users").get();
    const users = [];

    for (const doc of snapshot.docs) {
      const data = doc.data();

      // Excluir admins e instructores
      if (data.rol === "Admin" || data.rol === "Instructor") continue;

      users.push({
        id: doc.id,
        firstname: data.firstname,
        lastname: data.lastname,
        level: data.level || 0,
      });
    }

    // Ordenar DESC por nivel
    const ranking = users.sort((a, b) => b.level - a.level);

    return ranking;
  }
}

module.exports = gamificationService;

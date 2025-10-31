// helpers/firebaseHelper.js
const admin = require("firebase-admin");
const { getFirestore } = require("firebase-admin/firestore");

let db;

function conectfirebase() {
  try {
    if (!admin.apps.length) {
      const serviceAccount = JSON.parse(process.env.FIREBASE_CONFIG);

      // Asegura que los saltos de línea estén correctos
      serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, "\n");

      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });

      console.log("Conexión con Firebase exitosa");
    }

    db = getFirestore();
  } catch (error) {
    console.error("Error al conectar con Firebase:", error);
  }
}

function getdb() {
  if (!db) {
    throw new Error("Firebase no está inicializado. Llama a conectfirebase() primero.");
  }
  return db;
}

module.exports = { getdb, conectfirebase };

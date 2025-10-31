const { initializeApp, cert } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const serviceAccount = require("../env/firebaseconfig.json");

function conectfirebase() {
  try {
    initializeApp({
      credential: cert(serviceAccount),
    });
    console.log("Conexión con Firebase exitosa");
  } catch (error) {
    console.error("Error al conectar con Firebase: ", error);
  }
}

function getdb() {
  let db = getFirestore(); // Guarda la instancia de Firestore
  return db;
}

module.exports = { getdb, conectfirebase }; // Exporta la instancia de Firestore directamente

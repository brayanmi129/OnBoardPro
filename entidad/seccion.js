const { getdb } = require('../api-ext/firebase/firebaseinit.js'); // Importar la instancia de Firestore
const db = getdb()

class Seccion {

    static async getAll(req , res) {
        try{
        const snapshot = await db.collection('secciones').get();
        const secciones = [];
        snapshot.forEach(doc => secciones.push({ id: doc.id, ...doc.data() }));
        res.status(200).json(secciones);
        }catch(error){
            console.error("Error al obtener las secciones:", error);
            res.status(500).send("Error al obtener las secciones");
        }
    }

}

module.exports = Seccion;

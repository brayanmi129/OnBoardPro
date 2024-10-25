const functions = require('firebase-functions'); // Importar funciones de Firebase
const { getdb } = require('../api-ext/firebase/firebaseinit.js'); // Importar la instancia de Firestore



class AuthController {

    async AuthUser(req, res) {
        const db = getdb();
        const { user, password } = req.body; // Extraer correctamente user y password
        const collectionReference = db.collection('users');

        try {
            // Buscar el usuario por nombre
            const snapshot = await collectionReference.where('name', '==', user).get();

            if (snapshot.empty) {
                res.send('No matching documents.');
                return;
            }

            let docId; // Declarar la variable docId
            snapshot.forEach(doc => {
                docId = doc.id; // Obtener el ID del documento encontrado
                console.log('ID del usuario encontrado: ', docId);
            });

            // Ahora que tenemos el ID, buscamos la contraseña
            const docRef = collectionReference.doc(docId);
            const docSnapshot = await docRef.get(); // Obtener el documento

            if (docSnapshot.exists) {
                const userData = docSnapshot.data();
                console.log('Usuario encontrado: ', userData.name);
                if (userData.password === password) { // Comparar con la contraseña
                    console.log('Contraseña correcta');
                    res.status(200).send('Usuario y contraseña correctos');
                } else {
                    console.log('Contraseña enviada por el usuario ', password, 'Contraseña almacenada en la base: ', userData.password);
                    res.status(401).send('Contraseña incorrecta');
                }
            } else {
                res.send('No matching documents.');
            }
        } catch (error) {
            console.error("Error al obtener los usuarios: ", error);
            res.status(500).send('Error interno del servidor.');
        }
    }

   
  
}

module.exports = new AuthController();
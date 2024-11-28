// Importar el módulo de Google Drive
const { google } = require("googleapis");
const { Readable } = require('stream');

// Configuración de Google Drive API
const oAuth2Client = new google.auth.OAuth2(
  "93795014782-iq9pi0sqeei1290k81lugr3nhclhej26.apps.googleusercontent.com",  // Tu client_id
  "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",  // Tu client_secret
);

oAuth2Client.setCredentials({
  refresh_token: `${process.env.REFRESH_TOKEN}`,
});

const drive = google.drive({ version: "v3", auth: oAuth2Client });

// Función para subir el archivo a una carpeta específica de Google Drive
const getMimeType = (fileName) => {
    const ext = fileName.split('.').pop().toLowerCase();
    
    switch (ext) {
      case 'pdf':
        return 'application/pdf';
      case 'jpg':
      case 'jpeg':
        return 'image/jpeg';
      case 'png':
        return 'image/png';
      case 'gif':
        return 'image/gif';
      case 'webp':
        return 'image/webp';
      case 'svg':
        return 'image/svg+xml';
      case 'mp4':
        return 'video/mp4';
      case 'avi':
        return 'video/x-msvideo';
      case 'mov':
        return 'video/quicktime';
      case 'mkv':
        return 'video/x-matroska';
      default:
        return 'application/octet-stream'; // Valor por defecto si no se encuentra el tipo
    }
  };
  
  const uploadFileToDrive = async (fileBuffer, fileName) => {
    const fileStream = Readable.from(fileBuffer);
    try {
      const mimeType = getMimeType(fileName); // Obtener el mimeType según la extensión del archivo
  
      const fileMetadata = {
        name: fileName,
        mimeType: mimeType, // Usar el mimeType dinámico
        parents: ["1coxbND7aZHSRs4URCO4fkn3Guz938NTK"], // ID de la carpeta donde se guardará el archivo
      };
  
      const media = {
        mimeType: mimeType, // Usar el mimeType dinámico
        body: fileStream,
      };
  
      const response = await drive.files.create({
        requestBody: fileMetadata,
        media: media,
      });
  
      await drive.permissions.create({
        fileId: response.data.id,
        requestBody: {
          role: "reader",
          type: "anyone",
        },
      });
  
      const file = await drive.files.get({
        fileId: response.data.id,
        fields: "webViewLink, webContentLink",
      });
  
      return file.data.webViewLink; // O usa 'webContentLink' si prefieres el enlace de descarga directa
    } catch (error) {
      console.error("Error al subir el archivo: ", error);
      throw error;
    }
  };

module.exports = {uploadFileToDrive};


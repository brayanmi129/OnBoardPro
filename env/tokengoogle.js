const { google } = require("googleapis");
const readline = require("readline");

// Configura tus credenciales
const oAuth2Client = new google.auth.OAuth2(
  "93795014782-iq9pi0sqeei1290k81lugr3nhclhej26.apps.googleusercontent.com", // Reemplaza esto por tu client_id
  "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", // Reemplaza esto por tu client_secret
  "http://localhost:3000" // Redirect URI, puede ser cualquier valor (ej: http://localhost)
);

// Genera la URL para autorizar tu aplicación
const authUrl = oAuth2Client.generateAuthUrl({
  access_type: "offline", // Importante para obtener el refresh_token
  scope: ["https://www.googleapis.com/auth/drive.file"], // Permiso para Google Drive
});

console.log("Visita esta URL para autorizar la aplicación:");
console.log(authUrl);

// Espera el código de autorización después de visitar la URL
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

rl.question("Introdute ce el código de autenticación que obtuvisde la URL: ", (code) => {
  rl.close();
  oAuth2Client.getToken(code, (err, tokens) => {
    if (err) {
      return console.error("Error al obtener los tokens:", err.message);
    }
    console.log("Tokens obtenidos:");
    console.log(tokens);

    // Muestra el refresh_token
    console.log("Tu refresh_token es:");
    console.log(tokens.refresh_token);
  });
});

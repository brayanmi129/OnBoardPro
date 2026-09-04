require("dotenv").config();
const { google } = require("googleapis");
const readline = require("readline");

// Las credenciales se leen del .env; nunca deben escribirse en el código.
if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
  console.error("Faltan GOOGLE_CLIENT_ID y/o GOOGLE_CLIENT_SECRET en el .env");
  process.exit(1);
}

const oAuth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  "http://localhost:3000" // Redirect URI: cualquiera registrada en la consola de Google
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

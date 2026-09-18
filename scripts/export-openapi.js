// Exporta el Swagger que sirve el backend a docs/openapi.json.
//
// El archivo se desfasa en cuanto alguien agrega un endpoint y no lo vuelve a
// exportar, y como el frontend se guía por él, un archivo viejo manda a llamar
// rutas que ya no existen. Correr `npm run docs` después de tocar las rutas.
require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { swaggerSpec } = require("../config/swagger");

const destino = path.join(__dirname, "..", "docs", "openapi.json");
fs.writeFileSync(destino, JSON.stringify(swaggerSpec, null, 2) + "\n");

const rutas = Object.keys(swaggerSpec.paths || {});
console.log(`docs/openapi.json actualizado: ${rutas.length} rutas`);

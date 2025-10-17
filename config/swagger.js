// config/swagger.js
const swaggerJsdoc = require("swagger-jsdoc");
const swaggerUi = require("swagger-ui-express");

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "API OnBoardPro",
      version: "1.0.0",
      description: "Documentación de la app de OnBoardPro",
    },
  },
  apis: ["./routes/*.js"], // 👈 aquí Swagger buscará tus comentarios
};

const swaggerSpec = swaggerJsdoc(options);

module.exports = { swaggerUi, swaggerSpec };

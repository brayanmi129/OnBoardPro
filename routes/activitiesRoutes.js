const express = require("express");
const router = express.Router();
const verifyJWT = require("../middlewares/jwt.js");
const requireRole = require("../middlewares/requireRole.js");
const ActivitiesController = require("../controllers/activitiesController.js");
const subida = require("../middlewares/subida.js");

/**
 * @swagger
 * tags:
 *   name: Actividades
 *   description: Endpoints relacionados con actividades de las secciones
 */

/**
 * @swagger
 * /api/actividades/get/all:
 *   get:
 *     summary: Obtiene todas las actividades
 *     tags: [Actividades]
 *     responses:
 *       200:
 *         description: Lista de todas las actividades
 */
router.get("/get/all", verifyJWT, ActivitiesController.getAll);

/**
 * @swagger
 * /api/actividades/create:
 *   post:
 *     summary: Crea una nueva actividad con archivo adjunto
 *     tags: [Actividades]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - data
 *               - file
 *             properties:
 *               data:
 *                 type: string
 *                 description: JSON con los datos de la actividad
 *                 example: '{"name":"Actividad 1","description":"Primera actividad","id_seccion":"abc123"}'
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: Archivo adjunto de la actividad
 *     responses:
 *       201:
 *         description: Actividad creada correctamente
 *       400:
 *         description: Error en los datos o validación fallida
 */
router.post(
  "/create",
  verifyJWT,
  requireRole("admin", "superadmin", "instructor"),
  subida.material,
  ActivitiesController.create
);

/**
 * @swagger
 * /api/activities/{id}/adjunto:
 *   get:
 *     summary: Devuelve una URL temporal para ver o descargar el adjunto
 *     tags: [Actividades]
 *     description: >
 *       El material vive en un bucket privado, así que no tiene URL permanente.
 *       Este endpoint firma una que vence en una hora, y solo para actividades
 *       de la empresa del usuario autenticado.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Devuelve { url }
 *       404:
 *         description: La actividad no existe, no tiene adjunto o es de otra empresa
 */
router.get("/:id/adjunto", verifyJWT, ActivitiesController.adjunto);

module.exports = router;

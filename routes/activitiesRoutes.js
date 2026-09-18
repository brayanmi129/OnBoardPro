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
 * /api/activities/get/all:
 *   get:
 *     summary: Lista las actividades de la empresa del usuario
 *     tags: [Actividades]
 *     description: >
 *       Devuelve solo las actividades de la empresa del token. El superadmin las
 *       ve todas. El campo `adjunto` es una ruta interna, no una URL abrible:
 *       para verlo hay que pedir GET /api/activities/{id}/adjunto.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de actividades
 *       401:
 *         description: Token ausente o inválido
 */
router.get("/get/all", verifyJWT, ActivitiesController.getAll);

/**
 * @swagger
 * /api/activities/create:
 *   post:
 *     summary: Crea una actividad, con archivo adjunto opcional
 *     tags: [Actividades]
 *     description: >
 *       Se envía como multipart/form-data. Cada dato va en su propio campo, no
 *       dentro de un JSON. El archivo, si se manda, va en el campo `archivo` y
 *       se guarda en el bucket privado de Supabase Storage. Máximo 50 MB;
 *       se aceptan imágenes, PDF y video (mp4, webm, mov).
 *       El `id` y la empresa los pone el servidor.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - title
 *               - archivo
 *             properties:
 *               name:
 *                 type: string
 *                 maxLength: 50
 *                 example: act-induccion-1
 *               title:
 *                 type: string
 *                 maxLength: 100
 *                 example: Bienvenida a la empresa
 *               type:
 *                 type: string
 *                 enum: [Tarea, Recurso, Examen]
 *                 default: Recurso
 *               description:
 *                 type: string
 *                 maxLength: 400
 *               deliverable:
 *                 type: boolean
 *                 default: false
 *                 description: Si la actividad espera una entrega del aprendiz.
 *               archivo:
 *                 type: string
 *                 format: binary
 *                 description: >
 *                   Material de apoyo. Hoy es obligatorio: la columna `adjunto`
 *                   de la base es NOT NULL, así que una actividad sin archivo
 *                   se rechaza con 400.
 *     responses:
 *       201:
 *         description: Actividad creada
 *       400:
 *         description: Datos inválidos, tipo de archivo no permitido o supera los 50 MB
 *       401:
 *         description: Token ausente o inválido
 *       403:
 *         description: Rol sin permiso para crear actividades
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

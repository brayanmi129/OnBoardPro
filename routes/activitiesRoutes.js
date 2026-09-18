const express = require("express");
const router = express.Router();
const verifyJWT = require("../middlewares/jwt.js");
const requireRole = require("../middlewares/requireRole.js");
const ActivitiesController = require("../services/actividades.js");

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
router.post("/create", verifyJWT, requireRole("admin", "superadmin", "instructor"), ActivitiesController.create);

module.exports = router;

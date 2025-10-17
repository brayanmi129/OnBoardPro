const express = require("express");
const router = express.Router();
const Seccion = require("../services/seccion.js");

/**
 * @swagger
 * tags:
 *   name: Secciones
 *   description: Endpoints relacionados con secciones y sus actividades
 */

/**
 * @swagger
 * /api/secciones/get/all:
 *   get:
 *     summary: Obtiene todas las secciones
 *     tags: [Secciones]
 *     responses:
 *       200:
 *         description: Lista de todas las secciones
 */
router.get("/get/all", Seccion.getAll);

/**
 * @swagger
 * /api/secciones/get/activities/{id_seccion}:
 *   get:
 *     summary: Obtiene las actividades de una sección
 *     tags: [Secciones]
 *     parameters:
 *       - in: path
 *         name: id_seccion
 *         required: true
 *         schema:
 *           type: string
 *         description: ID de la sección
 *     responses:
 *       200:
 *         description: Lista de actividades de la sección
 *       404:
 *         description: La sección no tiene actividades
 */
router.get("/get/activities/:id_seccion", Seccion.getActivities);

/**
 * @swagger
 * /api/secciones/create:
 *   post:
 *     summary: Crea una nueva sección
 *     tags: [Secciones]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - description
 *             properties:
 *               name:
 *                 type: string
 *                 example: Sección 1
 *               description:
 *                 type: string
 *                 example: Sección de introducción al curso
 *     responses:
 *       201:
 *         description: Sección creada correctamente
 *       400:
 *         description: Error en los datos o validación fallida
 */
router.post("/create", Seccion.create);

module.exports = router;

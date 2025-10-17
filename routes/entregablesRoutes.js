const express = require("express");
const router = express.Router();
const Entregable = require("../services/entregable.js");

/**
 * @swagger
 * tags:
 *   name: Entregables
 *   description: Endpoints relacionados con entregables de actividades
 */

/**
 * @swagger
 * /api/entregables/get/all:
 *   get:
 *     summary: Obtiene todos los entregables
 *     tags: [Entregables]
 *     responses:
 *       200:
 *         description: Lista de todos los entregables
 */
router.get("/get/all", Entregable.getAll);

/**
 * @swagger
 * /api/entregables/create:
 *   post:
 *     summary: Crea un nuevo entregable
 *     tags: [Entregables]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - description
 *               - id_activity
 *             properties:
 *               name:
 *                 type: string
 *                 example: "Entregable 1"
 *               description:
 *                 type: string
 *                 example: "Descripción del entregable"
 *               id_activity:
 *                 type: string
 *                 example: "abc123"
 *     responses:
 *       201:
 *         description: Entregable creado correctamente
 *       400:
 *         description: Error en los datos o validación fallida
 */
router.post("/create", Entregable.create);

/**
 * @swagger
 * /api/entregables/delete:
 *   post:
 *     summary: Elimina un entregable por ID
 *     tags: [Entregables]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - id
 *             properties:
 *               id:
 *                 type: string
 *                 example: "abc123"
 *     responses:
 *       200:
 *         description: Entregable eliminado correctamente
 *       400:
 *         description: Falta el ID
 *       404:
 *         description: Entregable no encontrado
 */
router.post("/delete", Entregable.deleteById);

module.exports = router;

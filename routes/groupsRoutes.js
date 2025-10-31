const express = require("express");
const router = express.Router();
const GroupController = require("../controllers/groupsControler");

/**
 * @swagger
 * tags:
 *   name: Grupos
 *   description: Endpoints relacionados con la gestión de grupos
 */

/**
 * @swagger
 * /api/groups/get/all:
 *   get:
 *     summary: Obtiene todos los grupos con sus usuarios asociados
 *     tags: [Grupos]
 *     responses:
 *       200:
 *         description: Lista de todos los grupos
 */
router.get("/get/all", GroupController.getAll);

/**
 * @swagger
 * /api/groups/get/id/{id}:
 *   get:
 *     summary: Obtiene un grupo por su ID, incluyendo sus usuarios
 *     tags: [Grupos]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID del grupo
 *     responses:
 *       200:
 *         description: Grupo encontrado
 *       404:
 *         description: Grupo no encontrado
 */
router.get("/get/id/:id", GroupController.getById);

/**
 * @swagger
 * /api/groups/create:
 *   post:
 *     summary: Crea un nuevo grupo y opcionalmente agrega usuarios
 *     tags: [Grupos]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *                 example: Grupo A
 *               description:
 *                 type: string
 *                 example: Grupo de bienvenida
 *               userIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["usr123", "usr456"]
 *     responses:
 *       201:
 *         description: Grupo creado correctamente
 *       400:
 *         description: Error en los datos o validación fallida
 */
router.post("/create", GroupController.create);

module.exports = router;

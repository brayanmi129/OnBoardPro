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
 *     summary: Obtiene todos los grupos con sus usuarios y cursos asociados
 *     tags: [Grupos]
 *     responses:
 *       200:
 *         description: Lista de grupos
 */
router.get("/get/all", GroupController.getAll);

/**
 * @swagger
 * /api/groups/get/id/{id}:
 *   get:
 *     summary: Obtiene un grupo por su ID
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
 *         description: Error en los datos
 */
router.post("/create", GroupController.create);

/**
 * @swagger
 * /api/groups/update/{id}:
 *   put:
 *     summary: Actualiza la información de un grupo
 *     tags: [Grupos]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID del grupo a actualizar
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             example:
 *               name: Nuevo nombre del grupo
 *               description: Nueva descripción
 *     responses:
 *       200:
 *         description: Grupo actualizado correctamente
 *       400:
 *         description: Error de validación
 */
router.put("/update/:id", GroupController.update);

/**
 * @swagger
 * /api/groups/{id}/add-users:
 *   post:
 *     summary: Agrega usuarios a un grupo existente
 *     tags: [Grupos]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID del grupo
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               userIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["usr123", "usr456"]
 *     responses:
 *       200:
 *         description: Usuarios agregados correctamente
 */
router.post("/:id/add-users", GroupController.addUsers);

/**
 * @swagger
 * /api/groups/{id}/remove-users:
 *   delete:
 *     summary: Elimina usuarios específicos de un grupo
 *     tags: [Grupos]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID del grupo
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               userIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["usr123", "usr789"]
 *     responses:
 *       200:
 *         description: Usuarios eliminados correctamente
 *       400:
 *         description: Error al eliminar usuarios
 */
router.delete("/:id/remove-users", GroupController.removeUsers);

/**
 * @swagger
 * /api/groups/delete/{id}:
 *   delete:
 *     summary: Elimina un grupo completamente junto con sus relaciones
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
 *         description: Grupo eliminado correctamente
 *       404:
 *         description: Grupo no encontrado
 */
router.delete("/delete/:id", GroupController.delete);

/**
 * @swagger
 * /api/groups/me:
 *   get:
 *     summary: Obtiene los grupos del usuario autenticado
 *     tags: [Grupos]
 *     security:
 *       - bearerAuth: []   # Requiere token JWT
 *     responses:
 *       200:
 *         description: Lista de grupos asociados al usuario autenticado
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: string
 *                     example: "abc123"
 *                   name:
 *                     type: string
 *                     example: "Introducción a la programación"
 *                   description:
 *                     type: string
 *                     example: "Curso básico de fundamentos de programación"
 *                   image:
 *                     type: string
 *                     example: "https://example.com/course-image.jpg"
 *       401:
 *         description: No autorizado. El token JWT es inválido o no fue enviado
 *       500:
 *         description: Error interno del servidor
 */
router.get("/me", GroupController.getMyGroups);

module.exports = router;

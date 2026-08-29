const express = require("express");
const router = express.Router();
const UserController = require("../controllers/userController");
const verifyJWT = require("../middlewares/jwt.js");
const requireRole = require("../middlewares/requireRole.js");

/**
 * @swagger
 * tags:
 *   name: Usuarios
 *   description: Endpoints relacionados con la gestión de usuarios
 */

/**
 * @swagger
 * /api/users/get/all:
 *   get:
 *     summary: Obtiene todos los usuarios del tenant
 *     tags: [Usuarios]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de usuarios sin contraseñas
 *       403:
 *         description: Sin permisos
 */
router.get("/get/all", verifyJWT, requireRole("admin", "superadmin"), UserController.getAll);

/**
 * @swagger
 * /api/users/get/email/{email}:
 *   get:
 *     summary: Obtiene un usuario por su correo electrónico
 *     tags: [Usuarios]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: email
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Usuario encontrado
 *       404:
 *         description: Usuario no encontrado
 */
router.get(
  "/get/email/:email",
  verifyJWT,
  requireRole("admin", "superadmin"),
  UserController.getByEmail
);

/**
 * @swagger
 * /api/users/get/id/{id}:
 *   get:
 *     summary: Obtiene un usuario por su ID
 *     tags: [Usuarios]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Usuario encontrado
 *       404:
 *         description: Usuario no encontrado
 */
router.get("/get/id/:id", verifyJWT, UserController.getById);

/**
 * @swagger
 * /api/users/get/role/{role}:
 *   get:
 *     summary: Obtiene todos los usuarios con un rol específico
 *     tags: [Usuarios]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: role
 *         required: true
 *         schema:
 *           type: string
 *           enum: [student, instructor, admin, superadmin]
 *     responses:
 *       200:
 *         description: Lista de usuarios con ese rol
 *       404:
 *         description: No se encontraron usuarios con ese rol
 */
router.get(
  "/get/role/:role",
  verifyJWT,
  requireRole("admin", "superadmin"),
  UserController.getByRole
);

/**
 * @swagger
 * /api/users/create:
 *   post:
 *     summary: Crea un nuevo usuario en el tenant
 *     tags: [Usuarios]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               firstname:
 *                 type: string
 *                 example: Juan
 *               lastname:
 *                 type: string
 *                 example: Pérez
 *               email:
 *                 type: string
 *                 example: juan@ucentral.edu.co
 *               password:
 *                 type: string
 *                 example: contraseña123
 *               role:
 *                 type: string
 *                 enum: [student, admin, instructor]
 *                 example: student
 *     responses:
 *       201:
 *         description: Usuario creado correctamente
 *       400:
 *         description: Error de validación
 *       403:
 *         description: Sin permisos
 */
router.post("/create", verifyJWT, requireRole("admin", "superadmin"), UserController.create);

/**
 * @swagger
 * /api/users/delete/{id}:
 *   delete:
 *     summary: Elimina un usuario por su ID
 *     tags: [Usuarios]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Usuario eliminado correctamente
 *       404:
 *         description: Usuario no encontrado
 */
router.delete("/delete/:id", verifyJWT, requireRole("admin", "superadmin"), UserController.deleteUser);

/**
 * @swagger
 * /api/users/update/{id}:
 *   put:
 *     summary: Actualiza los datos de un usuario
 *     tags: [Usuarios]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               firstname:
 *                 type: string
 *               lastname:
 *                 type: string
 *               role:
 *                 type: string
 *                 enum: [student, admin, instructor]
 *               status:
 *                 type: string
 *                 enum: [Active, Inactive]
 *     responses:
 *       200:
 *         description: Usuario actualizado correctamente
 *       400:
 *         description: Error de validación
 */
router.put("/update/:id", verifyJWT, requireRole("admin", "superadmin"), UserController.updateUser);

module.exports = router;

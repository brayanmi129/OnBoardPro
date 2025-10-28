// routes/userRoutes.js
const express = require("express");
const router = express.Router();
const UserController = require("../controllers/userController");

/**
 * @swagger
 * tags:
 *   name: Usuarios
 *   description: Endpoints relacionados con usuarios y sus cursos
 */

/**
 * @swagger
 * /api/users/get/all:
 *   get:
 *     summary: Obtiene todos los usuarios
 *     tags: [Usuarios]
 *     responses:
 *       200:
 *         description: Lista de todos los usuarios sin contraseñas
 */
router.get("/get/all", UserController.getAll);

/**
 * @swagger
 * /api/users/get/email/{email}:
 *   get:
 *     summary: Obtiene un usuario por su correo electrónico
 *     tags: [Usuarios]
 *     parameters:
 *       - in: path
 *         name: email
 *         required: true
 *         schema:
 *           type: string
 *         description: Correo electrónico del usuario
 *     responses:
 *       200:
 *         description: Usuario encontrado
 *       404:
 *         description: Usuario no encontrado
 */
router.get("/get/email/:email", UserController.getByEmail);

/**
 * @swagger
 * /api/users/get/id/{id}:
 *   get:
 *     summary: Obtiene un usuario por su ID
 *     tags: [Usuarios]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID del usuario
 *     responses:
 *       200:
 *         description: Usuario encontrado
 *       404:
 *         description: Usuario no encontrado
 */
router.get("/get/id/:id", UserController.getById);

/**
 * @swagger
 * /api/users/get/rol/{rol}:
 *   get:
 *     summary: Obtiene todos los usuarios con un rol específico
 *     tags: [Usuarios]
 *     parameters:
 *       - in: path
 *         name: rol
 *         required: true
 *         schema:
 *           type: string
 *         description: Rol del usuario (ej. "admin", "student")
 *     responses:
 *       200:
 *         description: Lista de usuarios con ese rol
 *       404:
 *         description: No se encontraron usuarios con ese rol
 */
router.get("/get/rol/:rol", UserController.getByRole);

/**
 * @swagger
 * /api/users/create:
 *   post:
 *     summary: Crea un nuevo usuario
 *     tags: [Usuarios]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - email
 *               - password
 *               - rol
 *             properties:
 *               name:
 *                 type: string
 *                 example: Juan Pérez
 *               email:
 *                 type: string
 *                 example: juan@example.com
 *               password:
 *                 type: string
 *                 example: 123456
 *               rol:
 *                 type: string
 *                 example: student
 *     responses:
 *       201:
 *         description: Usuario creado correctamente
 *       400:
 *         description: Error en los datos o validación fallida
 */
router.post("/create", UserController.create);

/**
 * @swagger
 * /api/users/get/courses/{id_user}:
 *   get:
 *     summary: Obtiene los cursos en los que está inscrito un usuario
 *     tags: [Usuarios]
 *     parameters:
 *       - in: path
 *         name: id_user
 *         required: true
 *         schema:
 *           type: string
 *         description: ID del usuario
 *     responses:
 *       200:
 *         description: Lista de cursos del usuario
 *       404:
 *         description: El usuario no está inscrito en ningún curso
 */
router.get("/get/courses/:id_user", UserController.getUserCourses);

router.delete("/delete/:id", UserController.deleteUser);

router.put("/update/:id", UserController.updateUser);

module.exports = router;

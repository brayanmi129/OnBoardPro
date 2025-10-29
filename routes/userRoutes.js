// routes/userRoutes.js
const express = require("express");
const router = express.Router();
const UserController = require("../controllers/userController");

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
 *           enum: [Aprendiz, Administrador, Instructor]
 *         description: Rol del usuario
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
 *               - email
 *               - rol
 *             properties:
 *               fisrtname:
 *                 type: string
 *                 example: Juan
 *               lastname:
 *                 type: string
 *                 example: Pérez
 *               phonumber:
 *                 type: string
 *                 example: "3001234567"
 *               email:
 *                 type: string
 *                 example: juan@example.com
 *               password:
 *                 type: string
 *                 example: 123456
 *               rol:
 *                 type: string
 *                 enum: [Aprendiz, Administrador, Instructor]
 *                 example: Aprendiz
 *               status:
 *                 type: string
 *                 enum: [Active, Inactive]
 *                 example: Active
 *               level:
 *                 type: integer
 *                 example: 1
 *               xp:
 *                 type: integer
 *                 example: 100
 *               groups:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["onboarding"]
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

/**
 * @swagger
 * /api/users/delete/{id}:
 *   delete:
 *     summary: Elimina un usuario por su ID
 *     tags: [Usuarios]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID del usuario a eliminar
 *     responses:
 *       200:
 *         description: Usuario eliminado correctamente
 *       404:
 *         description: Usuario no encontrado
 */
router.delete("/delete/:id", UserController.deleteUser);

/**
 * @swagger
 * /api/users/update/{id}:
 *   put:
 *     summary: Actualiza los datos de un usuario
 *     tags: [Usuarios]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID del usuario a actualizar
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               fisrtname:
 *                 type: string
 *                 example: Carlos
 *               lastname:
 *                 type: string
 *                 example: López
 *               phonumber:
 *                 type: string
 *                 example: "3109876543"
 *               rol:
 *                 type: string
 *                 enum: [Aprendiz, Administrador, Instructor]
 *                 example: Instructor
 *               status:
 *                 type: string
 *                 enum: [Active, Inactive]
 *                 example: Active
 *               level:
 *                 type: integer
 *                 example: 3
 *               xp:
 *                 type: integer
 *                 example: 250
 *     responses:
 *       200:
 *         description: Usuario actualizado correctamente
 *       400:
 *         description: Error en los datos de actualización
 *       404:
 *         description: Usuario no encontrado
 */
router.put("/update/:id", UserController.updateUser);

module.exports = router;

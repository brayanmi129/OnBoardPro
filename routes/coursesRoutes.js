const express = require("express");
const router = express.Router();
const CourseController = require("../controllers/courseController");
const verifyToken = require("../middlewares/jwt.js");

/**
 * @swagger
 * tags:
 *   name: Cursos
 *   description: Endpoints relacionados con cursos y sus usuarios
 */

/**
 * @swagger
 * /api/courses/get/all:
 *   get:
 *     summary: Obtiene todos los cursos
 *     tags: [Cursos]
 *     responses:
 *       200:
 *         description: Lista de todos los cursos
 */
router.get("/get/all", CourseController.getAll);

/**
 * @swagger
 * /api/courses/get/id/{id}:
 *   get:
 *     summary: Obtiene un curso por su ID
 *     tags: [Cursos]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID del curso
 *     responses:
 *       200:
 *         description: Curso encontrado
 *       404:
 *         description: Curso no encontrado
 */
router.get("/get/id/:id", CourseController.getById);

/**
 * @swagger
 * /api/courses/create:
 *   post:
 *     summary: Crea un nuevo curso
 *     tags: [Cursos]
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
 *                 example: Curso de Node.js
 *               description:
 *                 type: string
 *                 example: Aprender a crear APIs con Node.js
 *     responses:
 *       201:
 *         description: Curso creado correctamente
 *       400:
 *         description: Error en los datos o validación fallida
 */
router.post("/create", CourseController.create);

/**
 * @swagger
 * /api/courses/me:
 *   get:
 *     summary: Obtiene los cursos del usuario autenticado
 *     tags: [Cursos]
 *     security:
 *       - bearerAuth: []   # Requiere token JWT
 *     responses:
 *       200:
 *         description: Lista de cursos asociados al usuario autenticado
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
router.get("/me", verifyToken, CourseController.getMyCourses);

module.exports = router;

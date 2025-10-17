const express = require("express");
const router = express.Router();
const Course = require("../services/curso.js");

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
router.get("/get/all", Course.getAll);

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
router.get("/get/id/:id", Course.getById);

/**
 * @swagger
 * /api/courses/get/users/{id_course}:
 *   get:
 *     summary: Obtiene los usuarios inscritos en un curso
 *     tags: [Cursos]
 *     parameters:
 *       - in: path
 *         name: id_course
 *         required: true
 *         schema:
 *           type: string
 *         description: ID del curso
 *     responses:
 *       200:
 *         description: Lista de emails de los usuarios inscritos
 *       404:
 *         description: No hay usuarios inscritos en este curso
 */
router.get("/get/users/:id_course", Course.getCoursesUsers);

/**
 * @swagger
 * /api/courses/get/seccions/{id_course}:
 *   get:
 *     summary: Obtiene las secciones de un curso
 *     tags: [Cursos]
 *     parameters:
 *       - in: path
 *         name: id_course
 *         required: true
 *         schema:
 *           type: string
 *         description: ID del curso
 *     responses:
 *       200:
 *         description: Lista de secciones del curso
 *       404:
 *         description: No hay secciones para este curso
 */
router.get("/get/seccions/:id_course", Course.getSeccions);

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
router.post("/create", Course.createCourse);

module.exports = router;

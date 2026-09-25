const express = require("express");
const router = express.Router();
const SectionController = require("../controllers/sectionController.js");
const verifyJWT = require("../middlewares/jwt.js");
const requireRole = require("../middlewares/requireRole.js");

// Editar la estructura del curso es tarea de quien lo dicta o lo administra.
const puedeEditar = requireRole("admin", "superadmin", "instructor");

/**
 * @swagger
 * tags:
 *   name: Secciones
 *   description: Estructura del curso. Un curso se divide en secciones ordenadas y cada una agrupa actividades.
 */

/**
 * @swagger
 * /api/courses/{id}/sections:
 *   get:
 *     summary: Lista las secciones de un curso con sus actividades
 *     tags: [Secciones]
 *     description: >
 *       Devuelve las secciones ordenadas, cada una con sus actividades ya
 *       ordenadas dentro. A un aprendiz no se le devuelven las secciones
 *       vacías. El campo `adjunto` de cada actividad es una ruta interna:
 *       para abrirlo hay que pedir GET /api/activities/{id}/adjunto.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Id del curso.
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Lista de secciones
 *       404:
 *         description: El curso no existe o es de otra organización
 */
router.get("/courses/:id/sections", verifyJWT, SectionController.listar);

/**
 * @swagger
 * /api/courses/{id}/sections:
 *   post:
 *     summary: Crea una sección dentro de un curso
 *     tags: [Secciones]
 *     description: >
 *       La sección queda al final del curso salvo que se indique `orden`.
 *       La organización se toma del curso, no del cuerpo.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name:
 *                 type: string
 *                 maxLength: 120
 *                 example: Módulo 1 - Bienvenida
 *               orden:
 *                 type: integer
 *                 description: Posición. Si se omite, va al final.
 *     responses:
 *       201:
 *         description: Sección creada
 *       400:
 *         description: Datos inválidos
 *       404:
 *         description: El curso no existe o es de otra organización
 */
router.post("/courses/:id/sections", verifyJWT, puedeEditar, SectionController.crear);

/**
 * @swagger
 * /api/sections/{id}:
 *   put:
 *     summary: Renombra una sección
 *     tags: [Secciones]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name: { type: string, maxLength: 120 }
 *     responses:
 *       200:
 *         description: Sección actualizada
 *       404:
 *         description: No existe o es de otra organización
 */
router.put("/sections/:id", verifyJWT, puedeEditar, SectionController.renombrar);

/**
 * @swagger
 * /api/sections/{id}:
 *   delete:
 *     summary: Elimina una sección vacía
 *     tags: [Secciones]
 *     description: >
 *       Una sección con actividades no se borra: primero hay que eliminarlas con
 *       DELETE /api/activities/{id}. Borrarla de arrastre perdería material que
 *       no se puede recuperar desde la interfaz.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Sección eliminada
 *       409:
 *         description: La sección todavía tiene actividades
 *       404:
 *         description: No existe o es de otra organización
 */
router.delete("/sections/:id", verifyJWT, puedeEditar, SectionController.eliminar);

module.exports = router;

const express = require("express");
const router = express.Router();
const EntregaController = require("../controllers/entregaController.js");
const verifyJWT = require("../middlewares/jwt.js");
const requireRole = require("../middlewares/requireRole.js");
const subida = require("../middlewares/subida.js");

const puedeCorregir = requireRole("admin", "superadmin", "instructor");

/**
 * @swagger
 * tags:
 *   name: Entregas
 *   description: >
 *     Trabajos que suben los aprendices en las actividades marcadas como
 *     entregables, y su calificación.
 */

/**
 * @swagger
 * /api/activities/{id}/entrega:
 *   post:
 *     summary: Sube o reemplaza mi entrega de una actividad
 *     tags: [Entregas]
 *     description: >
 *       Solo funciona en actividades con `deliverable: true`; el resto responde
 *       409. Se envía como multipart/form-data con el archivo en el campo
 *       `archivo` (máximo 50 MB: imagen, PDF o video) y, opcionalmente, un
 *       `comentario`.
 *       Hay **una sola entrega por persona y actividad**: volver a enviar
 *       reemplaza la anterior y borra el archivo viejo. Una vez calificada ya
 *       no se puede reemplazar, porque la nota dejaría de corresponder al
 *       trabajo corregido.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Id de la actividad.
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               archivo:    { type: string, format: binary }
 *               comentario: { type: string }
 *     responses:
 *       200:
 *         description: Entrega registrada o reemplazada
 *       400:
 *         description: No se envió ni archivo ni comentario
 *       404:
 *         description: La actividad no existe o es de otra organización
 *       409:
 *         description: La actividad no admite entregas, o la entrega ya fue calificada
 */
router.post("/activities/:id/entrega", verifyJWT, subida.material, EntregaController.entregar);

/**
 * @swagger
 * /api/activities/{id}/mi-entrega:
 *   get:
 *     summary: Mi entrega de esa actividad
 *     tags: [Entregas]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Devuelve la entrega con su estado, nota y retroalimentación
 *       404:
 *         description: Todavía no entregaste esta actividad
 */
router.get("/activities/:id/mi-entrega", verifyJWT, EntregaController.miEntrega);

/**
 * @swagger
 * /api/activities/{id}/entregas:
 *   get:
 *     summary: Todas las entregas de una actividad
 *     tags: [Entregas]
 *     description: >
 *       Para quien corrige. Incluye los datos del aprendiz que entregó, para no
 *       devolver solo ids.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Lista de entregas
 *       404:
 *         description: La actividad no existe o es de otra organización
 */
router.get("/activities/:id/entregas", verifyJWT, puedeCorregir, EntregaController.listar);

/**
 * @swagger
 * /api/entregas/{id}/revisar:
 *   put:
 *     summary: Revisa una entrega y decide si queda completa
 *     tags: [Entregas]
 *     description: >
 *       **No hay nota.** Esto es onboarding, no un curso: quien revisa decide
 *       si el trabajo está completo (`aprobada: true`) o si hay que rehacerlo
 *       (`aprobada: false`), y explica por qué.
 *
 *       El comentario es opcional al dar por completada la entrega y
 *       obligatorio al pedir cambios: "rehacelo" sin decir qué corregir no se
 *       puede cumplir.
 *
 *       Al aprobar se acredita el XP de la actividad —nunca al subir el
 *       archivo— y una actividad paga una sola vez, así que volver a aprobar
 *       no duplica puntos. Si se piden cambios, la entrega pasa a `rehacer` y
 *       el aprendiz puede reemplazarla.
 *
 *       Un instructor solo revisa entregas de los cursos que dicta.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Id de la entrega.
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [aprobada]
 *             properties:
 *               aprobada:
 *                 type: boolean
 *                 description: true la da por completa; false pide cambios.
 *               feedback:
 *                 type: string
 *                 example: Cubriste los tres puntos. Agregá el procedimiento de escalamiento.
 *     responses:
 *       200:
 *         description: Devuelve estado, xpAcreditado y nivel
 *       400:
 *         description: Falta indicar si queda aprobada, o se piden cambios sin comentario
 *       403:
 *         description: La entrega no pertenece a un curso que dicte el instructor
 *       404:
 *         description: La entrega no existe o es de otra organización
 */
router.put("/entregas/:id/revisar", verifyJWT, puedeCorregir, EntregaController.revisar);

/**
 * @swagger
 * /api/entregas/{id}/archivo:
 *   get:
 *     summary: URL temporal del archivo entregado
 *     tags: [Entregas]
 *     description: >
 *       El archivo vive en un bucket privado. Devuelve una URL firmada que vence
 *       en una hora. La ve el aprendiz que entregó y quien puede corregir dentro
 *       de la misma organización.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Devuelve { url }
 *       404:
 *         description: No existe, no tiene archivo, o no tenés acceso
 */
router.get("/entregas/:id/archivo", verifyJWT, EntregaController.archivo);

module.exports = router;

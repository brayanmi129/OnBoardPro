const express = require("express");
const router = express.Router();
const EntregaController = require("../controllers/entregaController.js");
const verifyJWT = require("../middlewares/jwt.js");
const requireRole = require("../middlewares/requireRole.js");
const subida = require("../middlewares/subida.js");
const { soloLectura } = require("../middlewares/soloLectura.js");

const puedeCorregir = requireRole("admin", "superadmin", "instructor");
// Ver entregas: instructor, admin y superadmin. Revisarlas: solo el instructor.
const soloInstructor = requireRole("instructor");

/**
 * @swagger
 * tags:
 *   name: Entregas
 *   description: >
 *     Trabajos que suben los aprendices en las actividades marcadas como
 *     entregables, y su revisión: aprobada o a rehacer.
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
 *       reemplaza la anterior y borra el archivo viejo. Una vez aprobada ya
 *       no se puede reemplazar: la aprobación dejaría de corresponder al
 *       trabajo revisado. Esto también vale si el instructor la aprueba
 *       mientras se está subiendo el reemplazo.
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
 *         description: >
 *           La actividad no admite entregas, la entrega ya fue aprobada, o hay
 *           otra entrega tuya registrándose en ese momento
 */
router.post("/activities/:id/entrega", verifyJWT, subida.material, EntregaController.entregar);

/**
 * @swagger
 * /api/activities/{id}/mi-entrega:
 *   get:
 *     summary: Mi entrega de esa actividad
 *     tags: [Entregas]
 *     description: >
 *       La revisión (`feedback`, `revisadoAt`, `revisadoPor` y `xpObtenido`)
 *       solo se muestra una vez revisada: mientras el estado sea `entregado`
 *       esos cuatro campos van en null, también si se reemplazó una entrega
 *       que había vuelto para rehacer. `xpObtenido` es el XP que de verdad
 *       acreditó esa actividad (null si no acreditó nada).
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: La entrega con su estado y su revisión
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MiEntrega'
 *       404:
 *         description: Todavía no entregaste esta actividad
 */
router.get("/activities/:id/mi-entrega", verifyJWT, EntregaController.miEntrega);

/**
 * @swagger
 * components:
 *   schemas:
 *     RevisorEntrega:
 *       type: object
 *       nullable: true
 *       properties:
 *         firstname: { type: string, example: Laura }
 *         lastname: { type: string, example: Gómez }
 *     MiEntrega:
 *       type: object
 *       properties:
 *         id: { type: string }
 *         activityId: { type: string }
 *         userId: { type: string }
 *         estado: { type: string, enum: [entregado, aprobada, rehacer] }
 *         archivo: { type: string, nullable: true }
 *         comentario: { type: string, nullable: true }
 *         entregadoAt: { type: string, format: date-time }
 *         feedback: { type: string, nullable: true }
 *         revisadoAt: { type: string, format: date-time, nullable: true }
 *         revisadoPor: { $ref: '#/components/schemas/RevisorEntrega' }
 *         xpObtenido: { type: integer, nullable: true, example: 40 }
 *     MiEntregaResumen:
 *       type: object
 *       properties:
 *         id: { type: string }
 *         actividad:
 *           type: object
 *           properties:
 *             id: { type: string }
 *             titulo: { type: string }
 *         curso:
 *           type: object
 *           nullable: true
 *           properties:
 *             id: { type: string }
 *             nombre: { type: string }
 *         estado: { type: string, enum: [entregado, aprobada, rehacer] }
 *         entregadoAt: { type: string, format: date-time }
 *         feedback: { type: string, nullable: true }
 *         revisadoAt: { type: string, format: date-time, nullable: true }
 *         revisadoPor: { $ref: '#/components/schemas/RevisorEntrega' }
 *         xpObtenido: { type: integer, nullable: true }
 */

/**
 * @swagger
 * /api/entregas/mias:
 *   get:
 *     summary: Todas mis entregas con su calificación y retroalimentación
 *     tags: [Entregas]
 *     description: >
 *       Las entregas de quien llama, de todos sus cursos. Primero las
 *       revisadas, de la más reciente a la más antigua; después las que
 *       esperan revisión, por fecha de entrega descendente. Mismas reglas que
 *       mi-entrega: la revisión va en null mientras el estado sea `entregado`.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de entregas (vacía si no entregó nada)
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/MiEntregaResumen'
 */
// Antes que cualquier /entregas/:id para que "mias" no se tome como un id.
router.get("/entregas/mias", verifyJWT, EntregaController.mias);

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
 * /api/entregas:
 *   get:
 *     summary: Mi bandeja de entregas por revisar
 *     tags: [Entregas]
 *     description: >
 *       Las entregas de todos los cursos de quien corrige, juntas: un
 *       instructor ve las de los cursos que dicta, un administrador las de su
 *       organización. Por defecto trae las que esperan revisión, de la más
 *       antigua a la más nueva, que es lo primero que hay que atender.
 *
 *       `contadores` trae siempre los totales por estado, con cualquier filtro:
 *       sirve para mostrar cuántas hay por revisar.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: estado
 *         schema: { type: string, enum: [entregado, rehacer, aprobada, todas], default: entregado }
 *         description: entregado son las que esperan revisión.
 *       - in: query
 *         name: orden
 *         schema: { type: string, enum: [antiguas, recientes], default: antiguas }
 *         description: Por fecha de entrega.
 *       - in: query
 *         name: cursoId
 *         schema: { type: string }
 *         description: Para ver solo las de un curso.
 *       - in: query
 *         name: tenantId
 *         schema: { type: string }
 *         description: Solo para el superadmin.
 *     responses:
 *       200:
 *         description: >
 *           Devuelve contadores (porRevisar, rehacer, aprobadas, total) y
 *           entregas, cada una con su actividad, su curso y el aprendiz
 *       400:
 *         description: estado u orden inválidos
 *       403:
 *         description: Quien llama es aprendiz
 *       404:
 *         description: El curso indicado no existe o no es de quien llama
 */
router.get("/entregas", verifyJWT, puedeCorregir, EntregaController.bandeja);

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
 *       archivo— y una actividad paga una sola vez. Si se piden cambios, la
 *       entrega pasa a `rehacer` y el aprendiz puede reemplazarla.
 *
 *       Una entrega **aprobada ya no se puede pasar a rehacer** (409). Volver a
 *       aprobarla responde 200 con "La entrega ya estaba aprobada." y no
 *       duplica puntos; si la primera vez el XP no llegó a acreditarse, lo
 *       completa.
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
 *         description: Devuelve message, estado, xpAcreditado, nivel y logrosDesbloqueados
 *       400:
 *         description: Falta indicar si queda aprobada, o se piden cambios sin comentario
 *       403:
 *         description: Solo el instructor revisa entregas (el administrador y el superadministrador no), y solo las de los cursos que dicta
 *       404:
 *         description: La entrega no existe o es de otra organización
 *       409:
 *         description: Se intentó pedir cambios sobre una entrega ya aprobada
 */
router.put("/entregas/:id/revisar", verifyJWT, soloInstructor, soloLectura, EntregaController.revisar);

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

const express = require("express");
const router = express.Router();
const ExamenService = require("../services/examenService.js");
const verifyJWT = require("../middlewares/jwt.js");
const requireRole = require("../middlewares/requireRole.js");

const puedeEditar = requireRole("admin", "superadmin", "instructor");

function actorDe(req) {
  return {
    id: req.user.id,
    email: req.user.email,
    role: req.user.role,
    tenantId: req.user.tenantId,
  };
}

function responder(res, error, contexto) {
  console.error(`${contexto}:`, error.message);
  return res.status(error.status || 500).json({ message: error.message });
}

/**
 * @swagger
 * tags:
 *   name: Exámenes
 *   description: >
 *     Preguntas y configuración de las actividades de tipo Examen. Un examen no
 *     es una entidad aparte: es una actividad con preguntas colgando, así que
 *     hereda sección, curso, empresa y XP.
 */

/**
 * @swagger
 * /api/activities/{id}/examen:
 *   get:
 *     summary: El examen completo, con sus preguntas
 *     tags: [Exámenes]
 *     description: >
 *       Devuelve las preguntas con sus opciones y el `puntajeTotal`, que se
 *       calcula sumando el puntaje de cada pregunta: no se guarda en ningún
 *       lado, así agregar una pregunta no deja un total desactualizado.
 *
 *       Con `?resolver=true` se obtiene **lo mismo que verá el aprendiz**, sin
 *       revelar cuál opción es la correcta. Eso es la previsualización del
 *       criterio 3, y es la misma forma que consumirá quien lo rinda.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Id de la actividad de tipo Examen.
 *         schema: { type: string }
 *       - in: query
 *         name: resolver
 *         description: true para ocultar las respuestas correctas.
 *         schema: { type: boolean }
 *     responses:
 *       200:
 *         description: Devuelve titulo, tiempoLimite, intentosPermitidos, puntajeTotal, preguntas y listoParaPublicar
 *       404:
 *         description: La actividad no existe o es de otra organización
 *       409:
 *         description: La actividad no es de tipo Examen
 */
router.get("/activities/:id/examen", verifyJWT, async (req, res) => {
  try {
    const r = await ExamenService.obtener(req.params.id, actorDe(req), {
      // El aprendiz nunca ve las respuestas, pida lo que pida.
      paraResolver: req.query.resolver === "true" || req.user.role === "student",
    });
    return res.status(200).json(r);
  } catch (error) {
    return responder(res, error, "Error al obtener el examen");
  }
});

/**
 * @swagger
 * /api/activities/{id}/preguntas:
 *   post:
 *     summary: Agrega una pregunta al examen
 *     tags: [Exámenes]
 *     description: >
 *       Cada pregunta necesita al menos dos opciones y **exactamente una**
 *       correcta: sin ninguna no se puede calificar, y con dos tampoco, porque
 *       todavía no hay selección múltiple.
 *       Se valida todo antes de escribir, y si fallan las opciones se deshace
 *       la pregunta: una pregunta sin opciones no sirve de nada.
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
 *             required: [enunciado, opciones]
 *             properties:
 *               enunciado:
 *                 type: string
 *                 example: ¿Cada cuánto se renueva la credencial de acceso?
 *               puntaje:
 *                 type: integer
 *                 default: 1
 *               opciones:
 *                 type: array
 *                 minItems: 2
 *                 items:
 *                   type: object
 *                   required: [texto, esCorrecta]
 *                   properties:
 *                     texto:      { type: string }
 *                     esCorrecta: { type: boolean }
 *     responses:
 *       201:
 *         description: Pregunta agregada
 *       400:
 *         description: Falta el enunciado, hay menos de dos opciones, o no hay exactamente una correcta
 *       403:
 *         description: El examen no pertenece a un curso que dicte el instructor
 *       409:
 *         description: La actividad no es de tipo Examen
 */
router.post("/activities/:id/preguntas", verifyJWT, puedeEditar, async (req, res) => {
  try {
    const r = await ExamenService.agregarPregunta(req.params.id, actorDe(req), req.body || {});
    return res.status(201).json(r);
  } catch (error) {
    return responder(res, error, "Error al agregar la pregunta");
  }
});

/**
 * @swagger
 * /api/activities/{id}/examen/config:
 *   put:
 *     summary: Configura tiempo límite e intentos
 *     tags: [Exámenes]
 *     description: >
 *       El puntaje total no se configura: sale de sumar las preguntas.
 *       `tiempoLimite` en minutos, o null para no limitar.
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
 *             properties:
 *               tiempoLimite:
 *                 type: integer
 *                 nullable: true
 *                 minimum: 1
 *                 maximum: 480
 *               intentosPermitidos:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 10
 *     responses:
 *       200:
 *         description: Examen configurado
 *       400:
 *         description: Valores fuera de rango, o no se envió nada
 */
router.put("/activities/:id/examen/config", verifyJWT, puedeEditar, async (req, res) => {
  try {
    const r = await ExamenService.configurar(req.params.id, actorDe(req), req.body || {});
    return res.status(200).json(r);
  } catch (error) {
    return responder(res, error, "Error al configurar el examen");
  }
});

/**
 * @swagger
 * /api/preguntas/{id}:
 *   put:
 *     summary: Edita una pregunta
 *     tags: [Exámenes]
 *     description: >
 *       Si se envían `opciones`, reemplazan a las anteriores por completo:
 *       editarlas una por una obligaría a llevar la cuenta de cuál se borró, y
 *       el conjunto tiene que seguir teniendo exactamente una correcta.
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
 *             properties:
 *               enunciado: { type: string }
 *               puntaje:   { type: integer, minimum: 1 }
 *               opciones:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     texto:      { type: string }
 *                     esCorrecta: { type: boolean }
 *     responses:
 *       200:
 *         description: Pregunta actualizada
 *       400:
 *         description: Enunciado vacío, puntaje inválido, o las opciones no tienen una sola correcta
 *       404:
 *         description: La pregunta no existe
 */
router.put("/preguntas/:id", verifyJWT, puedeEditar, async (req, res) => {
  try {
    const r = await ExamenService.editarPregunta(req.params.id, actorDe(req), req.body || {});
    return res.status(200).json(r);
  } catch (error) {
    return responder(res, error, "Error al editar la pregunta");
  }
});

/**
 * @swagger
 * /api/preguntas/{id}:
 *   delete:
 *     summary: Elimina una pregunta y sus opciones
 *     tags: [Exámenes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Pregunta eliminada
 *       404:
 *         description: La pregunta no existe
 */
router.delete("/preguntas/:id", verifyJWT, puedeEditar, async (req, res) => {
  try {
    const r = await ExamenService.eliminarPregunta(req.params.id, actorDe(req));
    return res.status(200).json(r);
  } catch (error) {
    return responder(res, error, "Error al eliminar la pregunta");
  }
});

module.exports = router;

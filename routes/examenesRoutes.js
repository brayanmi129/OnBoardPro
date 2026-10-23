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
 *       revelar cuál opción es la correcta. Sirve para previsualizar el examen
 *       antes de publicarlo, y es la misma forma que consumirá quien lo rinda.
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
 * /api/activities/{id}/examen:
 *   put:
 *     summary: Guarda el examen completo (configuración y preguntas)
 *     tags: [Exámenes]
 *     description: >
 *       Es lo que manda el editor al pulsar "Guardar". Lo que no se envía no se
 *       toca: mandar solo la configuración no borra las preguntas.
 *
 *       `preguntas` es la lista **entera y en orden**. Una pregunta con `id` se
 *       edita, una sin `id` se crea, y la que no viene en la lista se borra.
 *
 *       Cada pregunta necesita al menos dos opciones y **exactamente una**
 *       correcta. Se valida todo antes de escribir: si una pregunta está mal no
 *       se guarda nada, y el error dice cuál.
 *
 *       Si alguien ya rindió el examen, las preguntas no se pueden cambiar
 *       (409); la configuración sí.
 *
 *       El puntaje total no se envía: sale de sumar las preguntas.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Id de la actividad de tipo Examen.
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
 *                 description: En minutos, o null para no limitar.
 *               intentosPermitidos:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 10
 *               porcentajeAprobacion:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 100
 *                 default: 70
 *               preguntas:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [enunciado, opciones]
 *                   properties:
 *                     id:
 *                       type: string
 *                       description: Solo para editar una pregunta que ya existe.
 *                     enunciado:
 *                       type: string
 *                       example: ¿Cada cuánto se renueva la credencial de acceso?
 *                     puntaje:
 *                       type: integer
 *                       default: 1
 *                     opciones:
 *                       type: array
 *                       minItems: 2
 *                       items:
 *                         type: object
 *                         required: [texto, esCorrecta]
 *                         properties:
 *                           texto:      { type: string }
 *                           esCorrecta: { type: boolean }
 *     responses:
 *       200:
 *         description: Examen guardado, devuelve el examen completo con los ids de las preguntas
 *       400:
 *         description: >
 *           Valores fuera de rango, nada que guardar, una pregunta mal armada, o
 *           un id de pregunta que no es de este examen
 *       403:
 *         description: El examen no pertenece a un curso que dicte el instructor
 *       409:
 *         description: La actividad no es un examen, o ya fue rendido y se intentaron cambiar las preguntas
 */
router.put("/activities/:id/examen", verifyJWT, puedeEditar, async (req, res) => {
  try {
    const r = await ExamenService.guardar(req.params.id, actorDe(req), req.body || {});
    return res.status(200).json(r);
  } catch (error) {
    return responder(res, error, "Error al guardar el examen");
  }
});

/**
 * @swagger
 * /api/activities/{id}/examen/iniciar:
 *   post:
 *     summary: Abre un intento y devuelve el examen para resolver
 *     tags: [Exámenes]
 *     description: >
 *       Solo para aprendices. El intento se registra al abrirlo y no al
 *       enviarlo, porque el tiempo límite corre desde acá: `intento.venceAt`
 *       dice hasta cuándo se puede enviar.
 *
 *       Si ya había un intento abierto y sigue en tiempo, **se retoma** en vez
 *       de gastar otro. El examen viene sin las respuestas correctas.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Devuelve intento, intentosRestantes y examen
 *       403:
 *         description: Quien llama no es aprendiz
 *       409:
 *         description: >
 *           El examen no tiene preguntas, ya está aprobado, no quedan intentos o
 *           el curso no está publicado
 */
router.post("/activities/:id/examen/iniciar", verifyJWT, requireRole("student"), async (req, res) => {
  try {
    const r = await ExamenService.iniciar(req.params.id, actorDe(req));
    return res.status(200).json(r);
  } catch (error) {
    return responder(res, error, "Error al iniciar el examen");
  }
});

/**
 * @swagger
 * /api/activities/{id}/examen/responder:
 *   post:
 *     summary: Envía las respuestas del intento abierto y lo corrige
 *     tags: [Exámenes]
 *     description: >
 *       La corrección es automática y sale de la base. Una pregunta
 *       sin responder cuenta como incorrecta. Si el porcentaje alcanza el
 *       `porcentajeAprobacion` del examen, se acredita su XP y se evalúan los
 *       logros: la respuesta trae `logrosDesbloqueados`.
 *
 *       La opción correcta de cada pregunta (`detalle[].opcionCorrecta`) solo
 *       viene si aprobó o si ya no le quedan intentos.
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
 *             required: [respuestas]
 *             properties:
 *               respuestas:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [preguntaId, opcionId]
 *                   properties:
 *                     preguntaId: { type: string }
 *                     opcionId:   { type: string }
 *     responses:
 *       200:
 *         description: >
 *           Devuelve aprobado, puntaje, porcentaje, xpAcreditado,
 *           logrosDesbloqueados y detalle. Si aprobó pero el XP no se pudo
 *           acreditar en ese momento, `xpPendiente` viene en true: se completa
 *           solo la próxima vez que consulte sus intentos o vuelva al examen.
 *       400:
 *         description: Respuestas mal formadas, o preguntas u opciones que no son de este examen
 *       409:
 *         description: No hay intento abierto, ya se envió, o se acabó el tiempo
 */
router.post("/activities/:id/examen/responder", verifyJWT, requireRole("student"), async (req, res) => {
  try {
    const r = await ExamenService.responder(req.params.id, actorDe(req), req.body || {});
    return res.status(200).json(r);
  } catch (error) {
    return responder(res, error, "Error al enviar el examen");
  }
});

/**
 * @swagger
 * /api/activities/{id}/examen/intentos:
 *   get:
 *     summary: Mis intentos en un examen
 *     tags: [Exámenes]
 *     description: Cuántos intentos usé, cuántos me quedan, mi mejor porcentaje y si ya aprobé.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Resumen e historial de intentos
 */
router.get("/activities/:id/examen/intentos", verifyJWT, async (req, res) => {
  try {
    const r = await ExamenService.misIntentos(req.params.id, actorDe(req));
    return res.status(200).json(r);
  } catch (error) {
    return responder(res, error, "Error al obtener los intentos");
  }
});

/**
 * @swagger
 * /api/activities/{id}/examen/resultados:
 *   get:
 *     summary: Resultados del examen por aprendiz
 *     tags: [Exámenes]
 *     description: >
 *       Para quien dicta o administra el curso. Incluye a quien todavía
 *       no lo rindió, con estado `sin_rendir`. Los demás estados son
 *       `en_curso`, `aprobado` y `no_aprobado`.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Devuelve resumen y aprendices con su mejor porcentaje
 *       403:
 *         description: El examen no pertenece a un curso que dicte el instructor
 */
router.get("/activities/:id/examen/resultados", verifyJWT, puedeEditar, async (req, res) => {
  try {
    const r = await ExamenService.resultados(req.params.id, actorDe(req));
    return res.status(200).json(r);
  } catch (error) {
    return responder(res, error, "Error al obtener los resultados");
  }
});

/**
 * @swagger
 * /api/activities/{id}/preguntas/{preguntaId}:
 *   put:
 *     summary: Edita una pregunta del examen
 *     tags: [Exámenes]
 *     description: >
 *       La pregunta tiene que ser de ese examen; si no, 404.
 *       Solo cambia lo que se envía. Si se envían `opciones`, reemplazan a las anteriores por completo:
 *       editarlas una por una obligaría a llevar la cuenta de cuál se borró, y
 *       el conjunto tiene que seguir teniendo exactamente una correcta.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Id de la actividad de tipo Examen.
 *         schema: { type: string }
 *       - in: path
 *         name: preguntaId
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
 *         description: El examen no existe, o la pregunta no es de ese examen
 */
router.put("/activities/:id/preguntas/:preguntaId", verifyJWT, puedeEditar, async (req, res) => {
  try {
    const r = await ExamenService.editarPregunta(
      req.params.id, req.params.preguntaId, actorDe(req), req.body || {}
    );
    return res.status(200).json(r);
  } catch (error) {
    return responder(res, error, "Error al editar la pregunta");
  }
});

/**
 * @swagger
 * /api/activities/{id}/preguntas/{preguntaId}:
 *   delete:
 *     summary: Elimina una pregunta del examen, con sus opciones
 *     tags: [Exámenes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Id de la actividad de tipo Examen.
 *         schema: { type: string }
 *       - in: path
 *         name: preguntaId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Pregunta eliminada
 *       404:
 *         description: El examen no existe, o la pregunta no es de ese examen
 */
router.delete("/activities/:id/preguntas/:preguntaId", verifyJWT, puedeEditar, async (req, res) => {
  try {
    const r = await ExamenService.eliminarPregunta(req.params.id, req.params.preguntaId, actorDe(req));
    return res.status(200).json(r);
  } catch (error) {
    return responder(res, error, "Error al eliminar la pregunta");
  }
});

module.exports = router;

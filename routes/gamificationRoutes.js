// routes/userRoutes.js
const express = require("express");
const router = express.Router();
const verifyJWT = require("../middlewares/jwt.js");
const gamificationController = require("../controllers/gamificationController");
const PendientesService = require("../services/pendientesService.js");
const GamificationService = require("../services/gamificationService.js");

/**
 * @swagger
 * /api/gamification/ranking:
 *   get:
 *     summary: El ranking de la organización, o de uno de sus grupos
 *     description: >
 *       Los aprendices de la organización ordenados por XP (a igual XP, por
 *       nombre), cada uno con su posición. Quedan afuera administradores e
 *       instructores. El superadmin ve todas las organizaciones.
 *
 *       Con `grupoId` solo aparecen los integrantes de ese grupo. Solo
 *       figuran aprendices activos.
 *
 *       Con `periodo` = `semana` o `mes`, `xp` es lo ganado desde el lunes
 *       00:00 o el día 1 00:00 en hora de Colombia (-05:00), y aparecen igual
 *       todos los aprendices, con 0 si no ganaron nada. `level` sigue siendo
 *       el nivel total.
 *     tags:
 *       - Gamificación
 *     parameters:
 *       - in: query
 *         name: periodo
 *         description: Por defecto `siempre` (el XP total).
 *         schema: { type: string, enum: [semana, mes, siempre], default: siempre }
 *       - in: query
 *         name: grupoId
 *         description: >
 *           Para ver solo a los integrantes de un grupo. Un aprendiz solo puede
 *           pedir grupos a los que pertenece; si no, 404. Para el ranking de un
 *           curso está GET /api/gamification/courses/{id}/ranking.
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Ranking generado correctamente
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: string
 *                     example: "u8923d"
 *                   firstname:
 *                     type: string
 *                     example: "Carlos"
 *                   lastname:
 *                     type: string
 *                     example: "Pérez"
 *                   level:
 *                     type: integer
 *                     example: 12
 *                   xp:
 *                     type: integer
 *                     description: XP total, o el del periodo pedido.
 *                     example: 340
 *                   posicion:
 *                     type: integer
 *                     example: 1
 *       400:
 *         description: periodo inválido
 *       404:
 *         description: El grupo no existe, es de otra organización o el aprendiz no es parte de él
 *       500:
 *         description: Error interno del servidor
 */
router.get("/ranking", verifyJWT, gamificationController.getRanking);

/**
 * @swagger
 * /api/gamification/me:
 *   get:
 *     summary: Mi XP, mi nivel y cuánto falta para el siguiente
 *     tags: [Gamificación]
 *     description: >
 *       El cálculo del nivel lo hace el servidor, no el cliente: así el panel,
 *       la app y cualquier otro consumidor muestran el mismo número. Usa la
 *       tabla de niveles de la organización, o la curva por defecto
 *       25 * n * (n + 3): 100 XP el nivel 1, 250 el 2, 450 el 3.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: >
 *           Devuelve xp, nivel, nombreNivel, xpSiguienteNivel, porcentaje,
 *           faltan, actividadesCompletadas y racha
 */
router.get("/me", verifyJWT, gamificationController.miProgreso);

/**
 * @swagger
 * /api/gamification/me/movimientos:
 *   get:
 *     summary: Mi historial de XP, de dónde salió cada punto
 *     tags: [Gamificación]
 *     description: >
 *       Los movimientos del libro de XP de quien llama, del más reciente al
 *       más antiguo. `motivo` es el valor guardado: actividad_completada,
 *       examen_aprobado, entrega_aprobada, concurso_aprobado o
 *       logro_desbloqueado.
 *
 *       `origen` dice qué lo generó: una actividad (con su curso) o un logro
 *       (con el curso solo si es un logro de curso). Si la actividad o el
 *       logro se borraron después, `origen.id` y `origen.titulo` van en null.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limite
 *         description: Cuántos devolver. Por defecto 20, máximo 100.
 *         schema: { type: integer, default: 20, minimum: 1, maximum: 100 }
 *     responses:
 *       200:
 *         description: Movimientos de XP
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 movimientos:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id: { type: string }
 *                       xp: { type: integer, example: 25 }
 *                       motivo: { type: string, example: examen_aprobado }
 *                       origen:
 *                         type: object
 *                         properties:
 *                           tipo: { type: string, enum: [actividad, logro] }
 *                           id: { type: string, nullable: true }
 *                           titulo: { type: string, nullable: true, example: Examen de inducción }
 *                           curso:
 *                             type: object
 *                             nullable: true
 *                             properties:
 *                               id: { type: string }
 *                               nombre: { type: string }
 *                       fecha: { type: string, format: date-time }
 */
router.get("/me/movimientos", verifyJWT, gamificationController.misMovimientos);

/**
 * @swagger
 * /api/gamification/activities/{id}/completar:
 *   post:
 *     summary: Marca una actividad como completada y acredita su XP
 *     tags: [Gamificación]
 *     description: >
 *       Cada actividad se puede completar una sola vez por persona: el segundo
 *       intento devuelve 409 y no suma nada. El movimiento queda registrado con
 *       su origen para poder auditarlo. Si el XP cruza un umbral, el nivel sube
 *       en la misma operación y la respuesta lo indica con `subioDeNivel`.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Id de la actividad.
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: XP acreditado. Devuelve xpGanado, xpBase, xp, nivel, subioDeNivel y logrosDesbloqueados
 *       404:
 *         description: La actividad no existe o es de otra organización
 *       409:
 *         description: Ya había completado esa actividad
 */
/**
 * @swagger
 * /api/gamification/courses/{id}/ranking:
 *   get:
 *     summary: Los aprendices con más XP dentro de un curso
 *     tags: [Gamificación]
 *     description: >
 *       A diferencia de /ranking, que es de toda la organización, acá solo
 *       cuenta el XP que salió de las actividades de ese curso. Sirve para el
 *       resumen del instructor, que quiere ver cómo va cada curso suyo.
 *
 *       Solo aparecen aprendices activos que tienen el curso asignado hoy por
 *       alguno de sus grupos: quien dicta o administra no compite, y a quien
 *       sacaron del grupo se le conserva el XP pero deja de figurar.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Id del curso.
 *         schema: { type: string }
 *       - in: query
 *         name: limite
 *         description: Cuántos devolver. Por defecto 3.
 *         schema: { type: integer, default: 3 }
 *       - in: query
 *         name: periodo
 *         description: >
 *           Por defecto `siempre`. Con `semana` o `mes` solo cuenta el XP de
 *           las actividades del curso ganado desde el lunes o el día 1 (hora
 *           de Colombia), y aparecen todos los aprendices asignados, con 0 si
 *           no ganaron nada en el periodo.
 *         schema: { type: string, enum: [semana, mes, siempre], default: siempre }
 *     responses:
 *       200:
 *         description: Lista ordenada por XP, con su posición
 *       400:
 *         description: periodo inválido
 *       404:
 *         description: El curso no existe o es de otra organización
 */
router.get("/courses/:id/ranking", verifyJWT, async (req, res) => {
  try {
    const r = await GamificationService.rankingDeCurso(
      req.params.id,
      { id: req.user.id, role: req.user.role, tenantId: req.user.tenantId },
      { limite: req.query.limite, periodo: req.query.periodo }
    );
    return res.status(200).json(r);
  } catch (error) {
    console.error("Error al calcular el ranking del curso:", error.message);
    return res.status(error.status || 500).json({ message: error.message });
  }
});

router.post("/activities/:id/completar", verifyJWT, gamificationController.completar);

/**
 * @swagger
 * /api/gamification/pendientes:
 *   get:
 *     summary: Qué tengo pendiente ahora
 *     tags: [Gamificación]
 *     description: >
 *       Pensado para llamarlo al iniciar sesión. La respuesta cambia según el rol:
 *
 *       **Aprendiz**: actividades de sus cursos publicados que todavía no
 *       completó (`actividadesPendientes`, hasta 20, en el orden del curso; cada
 *       una con `id`, `titulo`, `descripcion`, `tipo`, `xp`, `esEntregable`,
 *       `curso`, `courseId` y `seccion`), cuánto XP hay en juego, su nivel y sus
 *       entregas revisadas últimamente
 *       (`calificacionesRecientes`, cada una con `estado` aprobada o rehacer,
 *       `feedback` y `calificadaEl`).
 *
 *       **Instructor**: entregas esperando corrección y secciones vacías de sus cursos.
 *
 *       **Admin / superadmin**: aprendices sin equipo, equipos sin cursos y cursos
 *       sin instructor, que son las tres cosas que dejan a alguien sin poder trabajar.
 *       "Sin instructor" incluye cursos cuyo instructor no existe, está
 *       desactivado o no tiene un rol que pueda dictar.
 *
 *       Todo se calcula al momento: no hay tabla de pendientes. Una lista guardada
 *       se desincroniza; una calculada no puede mentir.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Resumen de pendientes según el rol
 *       401:
 *         description: Token ausente o inválido
 */
router.get("/pendientes", verifyJWT, async (req, res) => {
  try {
    const actor = {
      id: req.user.id,
      email: req.user.email,
      role: req.user.role,
      tenantId: req.user.tenantId,
    };
    return res.status(200).json(await PendientesService.de(actor));
  } catch (error) {
    console.error("Error al calcular los pendientes:", error.message);
    return res.status(500).json({ message: "Error al calcular los pendientes" });
  }
});

module.exports = router;

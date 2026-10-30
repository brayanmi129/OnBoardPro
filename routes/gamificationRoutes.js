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
 *     summary: Obtiene el ranking de usuarios por nivel
 *     description: >
 *       Retorna una lista de usuarios ordenados por nivel (descendente),
 *       excluyendo administradores e instructores.
 *       Solo incluye firstname, lastname, level e id.
 *     tags:
 *       - Gamificación
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
 *
 *       Si la organización tiene tope diario de XP, `topeDiario` dice el tope,
 *       cuánto ganó hoy y cuánto le queda; si no tiene, viene en null.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: >
 *           Devuelve xp, nivel, nombreNivel, xpSiguienteNivel, porcentaje,
 *           faltan, actividadesCompletadas, racha y topeDiario
 *           ({ tope, ganadoHoy, restante } o null)
 */
router.get("/me", verifyJWT, gamificationController.miProgreso);

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
 *
 *       Si la organización tiene tope diario y ya se alcanzó, la actividad
 *       queda completada pero `xpGanado` es menor que `xpBase` (o 0) y
 *       `avisoXp` lo explica.
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
 *         description: XP acreditado. Devuelve xpGanado, xpBase, avisoXp, xp, nivel y subioDeNivel
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
 *       Solo aparecen aprendices: quien dicta o administra no compite.
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
 *     responses:
 *       200:
 *         description: Lista ordenada por XP, con su posición
 *       404:
 *         description: El curso no existe o es de otra organización
 */
router.get("/courses/:id/ranking", verifyJWT, async (req, res) => {
  try {
    const r = await GamificationService.rankingDeCurso(
      req.params.id,
      { id: req.user.id, role: req.user.role, tenantId: req.user.tenantId },
      { limite: req.query.limite }
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

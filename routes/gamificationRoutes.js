// routes/userRoutes.js
const express = require("express");
const router = express.Router();
const verifyJWT = require("../middlewares/jwt.js");
const gamificationController = require("../controllers/gamificationController");

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
 *       - Gamification
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
 *       la app y cualquier otro consumidor muestran el mismo número.
 *       La curva es 25 * n * (n + 3): 100 XP el nivel 1, 250 el 2, 450 el 3.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Devuelve xp, nivel, xpSiguienteNivel, porcentaje, faltan y actividadesCompletadas
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
 *         description: XP acreditado. Devuelve xpGanado, xp, nivel y subioDeNivel
 *       404:
 *         description: La actividad no existe o es de otra organización
 *       409:
 *         description: Ya había completado esa actividad
 */
router.post("/activities/:id/completar", verifyJWT, gamificationController.completar);

module.exports = router;

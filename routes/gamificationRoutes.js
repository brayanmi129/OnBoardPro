// routes/userRoutes.js
const express = require("express");
const router = express.Router();
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
router.get("/ranking", gamificationController.getRanking);

module.exports = router;

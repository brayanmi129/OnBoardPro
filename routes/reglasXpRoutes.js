const express = require("express");
const router = express.Router();
const ReglasXpService = require("../services/reglasXpService.js");
const verifyJWT = require("../middlewares/jwt.js");
const requireRole = require("../middlewares/requireRole.js");

const puedeAdministrar = requireRole("admin", "superadmin");

function actorDe(req) {
  return { id: req.user.id, email: req.user.email, role: req.user.role, tenantId: req.user.tenantId };
}

function responder(res, error, contexto) {
  console.error(`${contexto}:`, error.message);
  return res.status(error.status || 500).json({ message: error.message });
}

/**
 * @swagger
 * tags:
 *   name: Reglas de XP
 *   description: >
 *     Límites para que el XP mida aprendizaje y no insistencia. Siempre
 *     valen: una actividad paga una sola vez, un examen aprobado en un
 *     reintento paga la mitad y un concurso se puede rejugar sin volver a
 *     pagar. Cada organización puede sumar un tope de XP por día.
 */

/**
 * @swagger
 * /api/gamification/reglas-xp:
 *   get:
 *     summary: Las reglas de XP de la organización
 *     tags: [Reglas de XP]
 *     description: >
 *       `topeDiario` es el máximo de XP de actividades que una persona puede
 *       ganar por día (en hora de Colombia), o null si no hay tope. Los
 *       premios de logros no cuentan para el tope. El superadmin indica la
 *       organización con `?tenantId=`.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: tenantId
 *         description: Solo para el superadmin.
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Devuelve tenantId, topeDiario y la descripción de las reglas fijas
 *       400:
 *         description: El superadmin no indicó la organización
 */
router.get("/reglas-xp", verifyJWT, async (req, res) => {
  try {
    return res.status(200).json(await ReglasXpService.obtener(actorDe(req), req.query.tenantId));
  } catch (error) {
    return responder(res, error, "Error al obtener las reglas de XP");
  }
});

/**
 * @swagger
 * /api/gamification/reglas-xp:
 *   put:
 *     summary: Define el tope diario de XP de la organización
 *     tags: [Reglas de XP]
 *     description: >
 *       Con un número, nadie gana más de ese XP de actividades por día: lo que
 *       pase del tope se registra como completado pero sin XP, y la respuesta
 *       de la acreditación lo avisa en `avisoXp`. Con null se quita el tope.
 *       No cambia el XP ya ganado.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [topeDiario]
 *             properties:
 *               topeDiario:
 *                 type: integer
 *                 nullable: true
 *                 minimum: 1
 *                 maximum: 100000
 *                 example: 150
 *               tenantId:
 *                 type: string
 *                 description: Solo para el superadmin.
 *     responses:
 *       200:
 *         description: Devuelve message y las reglas actualizadas
 *       400:
 *         description: Falta topeDiario o no es un entero válido
 *       403:
 *         description: Quien llama no es administrador
 */
router.put("/reglas-xp", verifyJWT, puedeAdministrar, async (req, res) => {
  try {
    return res.status(200).json(await ReglasXpService.guardar(actorDe(req), req.body || {}));
  } catch (error) {
    return responder(res, error, "Error al guardar las reglas de XP");
  }
});

module.exports = router;

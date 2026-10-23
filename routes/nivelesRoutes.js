const express = require("express");
const router = express.Router();
const NivelesService = require("../services/nivelesService.js");
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
 *   name: Niveles
 *   description: >
 *     La tabla de niveles de cada organización: cuánto XP pide cada nivel y
 *     cómo se llama. Si una organización no define la suya, se usa la curva
 *     por defecto (100, 250, 450, 700, 1000... XP).
 */

/**
 * @swagger
 * /api/gamification/niveles:
 *   get:
 *     summary: La tabla de niveles de la organización
 *     tags: [Niveles]
 *     description: >
 *       `personalizada` dice si la organización definió la suya. Si no, se
 *       devuelven los primeros 10 niveles de la curva por defecto.
 *       El superadmin indica la organización con `?tenantId=`.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: tenantId
 *         description: Solo para el superadmin.
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Devuelve personalizada y niveles (numero, xpMinimo, nombre)
 *       400:
 *         description: El superadmin no indicó la organización
 */
router.get("/niveles", verifyJWT, async (req, res) => {
  try {
    return res.status(200).json(await NivelesService.obtener(actorDe(req), req.query.tenantId));
  } catch (error) {
    return responder(res, error, "Error al obtener los niveles");
  }
});

/**
 * @swagger
 * /api/gamification/niveles:
 *   put:
 *     summary: Define la tabla de niveles de la organización
 *     tags: [Niveles]
 *     description: >
 *       Recibe la tabla entera, en orden: el primero es el nivel 1, el segundo
 *       el 2, etc. Cada nivel tiene que pedir más XP que el anterior.
 *
 *       Al guardar **se recalcula el nivel de todas las personas de la
 *       organización**, y puede bajar: si se suben los umbrales, alguien en
 *       nivel 4 puede quedar en 3. En el uso normal (ganar XP) el nivel nunca
 *       baja. Todo se aplica junto: si algo falla, no cambia nada.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [niveles]
 *             properties:
 *               tenantId:
 *                 type: string
 *                 description: Solo para el superadmin.
 *               niveles:
 *                 type: array
 *                 minItems: 1
 *                 maxItems: 50
 *                 items:
 *                   type: object
 *                   required: [xpMinimo]
 *                   properties:
 *                     xpMinimo: { type: integer, minimum: 1, example: 100 }
 *                     nombre:   { type: string, maxLength: 40, example: Nuevo ingreso }
 *     responses:
 *       200:
 *         description: Devuelve message, personasConNivelNuevo y la tabla guardada
 *       400:
 *         description: Tabla vacía, más de 50 niveles, XP que no sube, o nombre demasiado largo (el mensaje dice qué nivel)
 *       403:
 *         description: Quien llama no es administrador
 */
router.put("/niveles", verifyJWT, puedeAdministrar, async (req, res) => {
  try {
    return res.status(200).json(await NivelesService.guardar(actorDe(req), req.body || {}));
  } catch (error) {
    return responder(res, error, "Error al guardar los niveles");
  }
});

/**
 * @swagger
 * /api/gamification/niveles:
 *   delete:
 *     summary: Vuelve a la tabla de niveles por defecto
 *     tags: [Niveles]
 *     description: >
 *       Borra la tabla propia de la organización y recalcula el nivel de todas
 *       sus personas con la curva por defecto.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: tenantId
 *         description: Solo para el superadmin.
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Devuelve message, personasConNivelNuevo y la tabla por defecto
 *       403:
 *         description: Quien llama no es administrador
 */
router.delete("/niveles", verifyJWT, puedeAdministrar, async (req, res) => {
  try {
    return res.status(200).json(await NivelesService.restaurar(actorDe(req), req.query.tenantId));
  } catch (error) {
    return responder(res, error, "Error al restaurar los niveles");
  }
});

module.exports = router;

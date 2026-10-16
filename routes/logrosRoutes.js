const express = require("express");
const router = express.Router();
const LogroService = require("../services/logroService.js");
const verifyJWT = require("../middlewares/jwt.js");
const requireRole = require("../middlewares/requireRole.js");

// El catálogo lo administra la organización; los aprendices solo lo consultan.
const puedeAdministrar = requireRole("admin", "superadmin");

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
 *   name: Logros
 *   description: >
 *     Catálogo de logros de la organización (HU-059). Un logro es la
 *     definición de una meta —"completar 10 actividades", "llegar al nivel
 *     5"—, no el hecho de haberla conseguido: el desbloqueo automático llega
 *     con HU-061.
 */

/**
 * @swagger
 * /api/gamification/logros/opciones:
 *   get:
 *     summary: Categorías y tipos de condición disponibles
 *     tags: [Logros]
 *     description: >
 *       Lo que necesita el formulario de creación para armar sus listas
 *       desplegables, en vez de tenerlas escritas a mano en el frontend y que
 *       se desincronicen del backend.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Devuelve categorias y condiciones con su unidad y un ejemplo
 */
router.get("/logros/opciones", verifyJWT, (req, res) => {
  return res.status(200).json(LogroService.opciones());
});

/**
 * @swagger
 * /api/gamification/logros:
 *   post:
 *     summary: Crea un logro
 *     tags: [Logros]
 *     description: >
 *       La organización sale del token, nunca del cuerpo: si viniera del
 *       cliente, un administrador podría crear logros dentro de otra empresa.
 *       Solo un superadministrador puede enviar `tenantId` para crear en una
 *       organización distinta a la suya.
 *
 *       No se admiten condiciones basadas en notas: en onboarding no hay
 *       calificación, la entrega se aprueba o se pide rehacer.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [nombre, categoria, tipoCondicion, meta]
 *             properties:
 *               nombre:
 *                 type: string
 *                 example: En marcha
 *               descripcion:
 *                 type: string
 *                 example: La segunda parada del camino.
 *               categoria:
 *                 type: string
 *                 enum: [Progreso, Constancia, Nivel, Ranking, Entregas, Juegos]
 *               tipoCondicion:
 *                 type: string
 *                 enum: [actividades_completadas, secciones_completadas, cursos_completados, racha_dias, nivel_alcanzado, entregas_aprobadas, posicion_ranking, juegos_completados]
 *               meta:
 *                 type: integer
 *                 minimum: 1
 *                 example: 10
 *               xpRecompensa:
 *                 type: integer
 *                 minimum: 0
 *                 default: 0
 *     responses:
 *       201:
 *         description: Logro creado
 *       400:
 *         description: Falta un campo, la categoría o el tipo de condición no existen, o la meta no es un entero positivo
 *       403:
 *         description: Solo un administrador puede crear logros
 *       409:
 *         description: Ya hay un logro con ese nombre en la organización
 */
router.post("/logros", verifyJWT, puedeAdministrar, async (req, res) => {
  try {
    const r = await LogroService.crear(actorDe(req), req.body || {});
    return res.status(201).json(r);
  } catch (error) {
    return responder(res, error, "Error al crear el logro");
  }
});

/**
 * @swagger
 * /api/gamification/logros:
 *   get:
 *     summary: El catálogo de logros de mi organización
 *     tags: [Logros]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: categoria
 *         schema: { type: string }
 *       - in: query
 *         name: activo
 *         schema: { type: boolean }
 *     responses:
 *       200:
 *         description: Lista de logros ordenada por categoría y meta
 */
router.get("/logros", verifyJWT, async (req, res) => {
  try {
    return res.status(200).json(await LogroService.listar(actorDe(req), req.query));
  } catch (error) {
    return responder(res, error, "Error al listar los logros");
  }
});

/**
 * @swagger
 * /api/gamification/logros/{id}:
 *   get:
 *     summary: Un logro
 *     tags: [Logros]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: El logro
 *       404:
 *         description: No existe o es de otra organización
 */
router.get("/logros/:id", verifyJWT, async (req, res) => {
  try {
    return res.status(200).json(await LogroService.obtener(req.params.id, actorDe(req)));
  } catch (error) {
    return responder(res, error, "Error al obtener el logro");
  }
});

/**
 * @swagger
 * /api/gamification/logros/{id}:
 *   put:
 *     summary: Edita un logro
 *     tags: [Logros]
 *     description: >
 *       Se puede enviar un solo campo. Desactivarlo con `activo: false` lo saca
 *       de circulación sin borrarlo, que es lo que conviene cuando alguien ya
 *       lo consiguió.
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
 *               nombre:        { type: string }
 *               descripcion:   { type: string }
 *               categoria:     { type: string }
 *               tipoCondicion: { type: string }
 *               meta:          { type: integer, minimum: 1 }
 *               xpRecompensa:  { type: integer, minimum: 0 }
 *               activo:        { type: boolean }
 *     responses:
 *       200:
 *         description: Logro actualizado
 *       400:
 *         description: No se envió nada que cambiar, o un valor es inválido
 *       404:
 *         description: No existe o es de otra organización
 *       409:
 *         description: Ya hay un logro con ese nombre
 */
router.put("/logros/:id", verifyJWT, puedeAdministrar, async (req, res) => {
  try {
    return res.status(200).json(
      await LogroService.actualizar(req.params.id, actorDe(req), req.body || {})
    );
  } catch (error) {
    return responder(res, error, "Error al actualizar el logro");
  }
});

/**
 * @swagger
 * /api/gamification/logros/{id}:
 *   delete:
 *     summary: Elimina un logro
 *     tags: [Logros]
 *     description: >
 *       Si el logro ya circuló conviene desactivarlo en vez de borrarlo, para
 *       no dejar sin respaldo a quien lo haya conseguido.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Logro eliminado
 *       404:
 *         description: No existe o es de otra organización
 */
router.delete("/logros/:id", verifyJWT, puedeAdministrar, async (req, res) => {
  try {
    return res.status(200).json(await LogroService.eliminar(req.params.id, actorDe(req)));
  } catch (error) {
    return responder(res, error, "Error al eliminar el logro");
  }
});

module.exports = router;

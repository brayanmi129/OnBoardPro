const express = require("express");
const router = express.Router();
const LogroService = require("../services/logroService.js");
const DesbloqueoService = require("../services/desbloqueoService.js");
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
 *     Catálogo de logros de la organización. Un logro es la definición de
 *     una meta —"completar 10 actividades", "llegar al nivel 5"—, no el hecho
 *     de haberla conseguido. El desbloqueo es automático: se evalúa cada vez
 *     que alguien gana XP, y cada persona ve los suyos en
 *     GET /api/gamification/logros/mios.
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
 *       Un logro vive en uno de tres alcances: genérico (sin organización,
 *       válido para todas, solo lo crea el superadministrador), de una empresa,
 *       o de un curso concreto si se envía `cursoId`.
 *
 *       La organización sale del token y nunca del cuerpo: si viniera del
 *       cliente, un administrador podría crear logros dentro de otra empresa.
 *
 *       Un logro genérico no puede atarse a un curso: el curso es de una sola
 *       empresa.
 *
 *       La **categoría no se envía**: sale del `tipoCondicion` (racha →
 *       Constancia, nivel → Nivel, etc.). El `icono` es opcional; sin uno, la
 *       API devuelve el de la categoría.
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
 *             required: [nombre, tipoCondicion, meta]
 *             properties:
 *               nombre:
 *                 type: string
 *                 example: En marcha
 *               descripcion:
 *                 type: string
 *                 example: La segunda parada del camino.
 *               icono:
 *                 type: string
 *                 maxLength: 100
 *                 description: Emoji o nombre de ícono. Si se omite se usa el de la categoría.
 *                 example: 🚀
 *               tipoCondicion:
 *                 type: string
 *                 enum: [actividades_completadas, secciones_completadas, cursos_completados, examenes_aprobados, racha_dias, nivel_alcanzado, entregas_aprobadas, posicion_ranking, juegos_completados]
 *               meta:
 *                 type: integer
 *                 minimum: 1
 *                 example: 10
 *               xpRecompensa:
 *                 type: integer
 *                 minimum: 0
 *                 default: 0
 *               cursoId:
 *                 type: string
 *                 description: >
 *                   Ata el logro a un curso. Si se omite, vale para toda la
 *                   organización.
 *               generico:
 *                 type: boolean
 *                 default: false
 *                 description: >
 *                   Lo deja sin organización, válido para todas. Solo un
 *                   superadministrador puede crearlos; a los demás les
 *                   responde 403.
 *     responses:
 *       201:
 *         description: Logro creado
 *       400:
 *         description: >
 *           Falta un campo, el tipo de condición no existe, la meta no es un
 *           entero positivo, o se ató un logro genérico a un curso
 *       403:
 *         description: No es administrador, o pidió un logro genérico sin ser superadministrador
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
 *       - in: query
 *         name: cursoId
 *         description: >
 *           Los de ese curso. Con `general` trae los que no pertenecen a
 *           ninguno.
 *         schema: { type: string }
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
 * /api/gamification/logros/mios:
 *   get:
 *     summary: Mis logros, ganados y por ganar
 *     tags: [Logros]
 *     description: >
 *       Todos los logros activos que le corresponden a quien pregunta (los de
 *       su organización y los genéricos), con `desbloqueado`, la fecha y el
 *       `progreso` de cada uno.
 *
 *       Antes de responder evalúa los pendientes: un logro de ranking
 *       que se ganó porque otros quedaron atrás aparece sin esperar a la
 *       próxima actividad. Los recién ganados vienen con `nuevo: true`.
 *
 *       Primero van los ganados, del más reciente al más viejo; después los
 *       que faltan, de los más avanzados a los menos.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Devuelve ganados, total, nuevos y logros
 */
// Va antes de /logros/:id: si no, Express toma "mios" como un id.
router.get("/logros/mios", verifyJWT, async (req, res) => {
  try {
    return res.status(200).json(await DesbloqueoService.mios(req.user.id));
  } catch (error) {
    return responder(res, error, "Error al obtener mis logros");
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
 *               icono:         { type: string, nullable: true, description: "null vuelve al ícono de la categoría" }
 *               tipoCondicion: { type: string, description: "Cambia también la categoría" }
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

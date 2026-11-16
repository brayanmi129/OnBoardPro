const express = require("express");
const router = express.Router();
const verifyJWT = require("../middlewares/jwt.js");
const requireRole = require("../middlewares/requireRole.js");
const DashboardService = require("../services/dashboardService.js");

/**
 * @swagger
 * tags:
 *   name: Tablero
 *   description: Indicadores de uso para la administración de la plataforma y de cada organización.
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     PeriodoTablero:
 *       type: object
 *       properties:
 *         dias: { type: integer, example: 30 }
 *         desde: { type: string, format: date-time }
 *         hasta: { type: string, format: date-time }
 *     UsuariosTablero:
 *       type: object
 *       properties:
 *         total: { type: integer, description: Usuarios del alcance sin contar superadmins }
 *         porRol:
 *           type: object
 *           properties:
 *             student: { type: integer }
 *             instructor: { type: integer }
 *             admin: { type: integer }
 *         activosPeriodo: { type: integer, description: Personas con algún movimiento de XP en el periodo }
 *         activosPeriodoAnterior: { type: integer }
 *     DiaTablero:
 *       type: object
 *       properties:
 *         fecha: { type: string, example: "2026-11-16" }
 *         xp: { type: integer }
 *         completadas: { type: integer }
 */

/**
 * @swagger
 * /api/dashboard:
 *   get:
 *     summary: Tablero de indicadores de la plataforma o de una organización
 *     tags: [Tablero]
 *     description: >
 *       El "periodo actual" son los últimos `dias` días y el "anterior", los
 *       `dias` previos. Una persona está activa si tuvo algún movimiento de XP
 *       en el periodo. Las fechas de `actividadPorDia` son días en hora de
 *       Colombia, uno por día aunque no haya pasado nada, terminando hoy.
 *
 *       **Superadmin sin tenantId** (`alcance: plataforma`): organizaciones,
 *       usuarios, cursos, XP, actividades completadas, serie por día y una
 *       fila por organización (`porOrganizacion`: id, nombre, activa,
 *       usuarios, aprendicesActivos, cursosPublicados, tasaFinalizacion,
 *       xpPeriodo).
 *
 *       **Admin, o superadmin con tenantId** (`alcance: organizacion`):
 *       usuarios, cursos, `tasaFinalizacion` {actual, anterior}, xpPromedio,
 *       XP, entregasPorRevisar, serie por día, `cursosDetalle` (por curso
 *       publicado: aprendices, avancePromedio, completaron) y
 *       `aprendicesSinActividad` (aprendices sin movimientos en los últimos 7
 *       días, máximo 20; `ultimaActividad` es el último día con actividad o
 *       null si nunca tuvo). Un admin ve siempre su organización, aunque
 *       mande otro tenantId.
 *
 *       `tasaFinalizacion` (0 a 100) = actividades completadas por los
 *       aprendices activos / actividades que tienen asignadas por sus grupos
 *       en cursos publicados. "anterior" cuenta solo lo completado antes del
 *       inicio del periodo. Los cursos totales no incluyen los archivados.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: tenantId
 *         description: Solo superadmin. Sin él, el tablero es de toda la plataforma.
 *         schema: { type: string }
 *       - in: query
 *         name: dias
 *         schema: { type: integer, minimum: 7, maximum: 90, default: 30 }
 *     responses:
 *       200:
 *         description: Indicadores según el alcance
 *         content:
 *           application/json:
 *             schema:
 *               oneOf:
 *                 - type: object
 *                   properties:
 *                     alcance: { type: string, enum: [plataforma] }
 *                     periodo: { $ref: '#/components/schemas/PeriodoTablero' }
 *                     organizaciones:
 *                       type: object
 *                       properties:
 *                         total: { type: integer }
 *                         activas: { type: integer }
 *                     usuarios: { $ref: '#/components/schemas/UsuariosTablero' }
 *                     cursos:
 *                       type: object
 *                       properties:
 *                         total: { type: integer }
 *                         publicados: { type: integer }
 *                     xp:
 *                       type: object
 *                       properties:
 *                         otorgadoPeriodo: { type: integer }
 *                         otorgadoPeriodoAnterior: { type: integer }
 *                     actividadesCompletadasPeriodo: { type: integer }
 *                     actividadPorDia:
 *                       type: array
 *                       items: { $ref: '#/components/schemas/DiaTablero' }
 *                     porOrganizacion:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id: { type: string }
 *                           nombre: { type: string }
 *                           activa: { type: boolean }
 *                           usuarios: { type: integer }
 *                           aprendicesActivos: { type: integer }
 *                           cursosPublicados: { type: integer }
 *                           tasaFinalizacion: { type: number, example: 42.5 }
 *                           xpPeriodo: { type: integer }
 *                 - type: object
 *                   properties:
 *                     alcance: { type: string, enum: [organizacion] }
 *                     organizacion:
 *                       type: object
 *                       properties:
 *                         id: { type: string }
 *                         nombre: { type: string }
 *                     periodo: { $ref: '#/components/schemas/PeriodoTablero' }
 *                     usuarios: { $ref: '#/components/schemas/UsuariosTablero' }
 *                     cursos:
 *                       type: object
 *                       properties:
 *                         total: { type: integer }
 *                         publicados: { type: integer }
 *                     tasaFinalizacion:
 *                       type: object
 *                       properties:
 *                         actual: { type: number }
 *                         anterior: { type: number }
 *                     xpPromedio: { type: number }
 *                     xp:
 *                       type: object
 *                       properties:
 *                         otorgadoPeriodo: { type: integer }
 *                         otorgadoPeriodoAnterior: { type: integer }
 *                     entregasPorRevisar: { type: integer }
 *                     actividadPorDia:
 *                       type: array
 *                       items: { $ref: '#/components/schemas/DiaTablero' }
 *                     cursosDetalle:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id: { type: string }
 *                           nombre: { type: string }
 *                           aprendices: { type: integer }
 *                           avancePromedio: { type: integer }
 *                           completaron: { type: integer }
 *                     aprendicesSinActividad:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id: { type: string }
 *                           nombre: { type: string }
 *                           apellido: { type: string }
 *                           ultimaActividad: { type: string, nullable: true }
 *       400:
 *         description: dias fuera de 7..90
 *       403:
 *         description: Quien llama es instructor o aprendiz
 *       404:
 *         description: La organización indicada no existe
 */
router.get("/", verifyJWT, requireRole("admin", "superadmin"), async (req, res) => {
  try {
    const actor = { id: req.user.id, role: req.user.role, tenantId: req.user.tenantId };
    const r = await DashboardService.de(actor, {
      tenantId: req.query.tenantId ? String(req.query.tenantId) : undefined,
      dias: req.query.dias,
    });
    return res.status(200).json(r);
  } catch (error) {
    console.error("Error al armar el tablero:", error.message);
    return res.status(error.status || 500).json({ message: error.message });
  }
});

module.exports = router;

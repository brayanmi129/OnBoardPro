const express = require("express");
const router = express.Router();
const TenantController = require("../controllers/tenantController.js");
const verifyJWT = require("../middlewares/jwt.js");
const requireRole = require("../middlewares/requireRole.js");

/**
 * @swagger
 * tags:
 *   name: Tenants
 *   description: Gestión de organizaciones/escuelas (solo superadmin)
 */

/**
 * @swagger
 * /api/tenants/get/all:
 *   get:
 *     summary: Lista todos los tenants
 *     tags: [Tenants]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de tenants
 *       403:
 *         description: Sin permisos
 */
router.get("/get/all", verifyJWT, requireRole("superadmin"), TenantController.getAll);

/**
 * @swagger
 * /api/tenants/get/id/{id}:
 *   get:
 *     summary: Obtiene un tenant por ID
 *     tags: [Tenants]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Tenant encontrado
 *       404:
 *         description: No encontrado
 */
router.get("/get/id/:id", verifyJWT, requireRole("superadmin"), TenantController.getById);

/**
 * @swagger
 * /api/tenants/create:
 *   post:
 *     summary: Crea un nuevo tenant (organización/escuela)
 *     tags: [Tenants]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - domain
 *             properties:
 *               name:
 *                 type: string
 *                 example: Universidad Central
 *               domain:
 *                 type: string
 *                 example: ucentral.edu.co
 *     responses:
 *       201:
 *         description: Tenant creado
 *       400:
 *         description: Error de validación
 */
router.post("/create", verifyJWT, requireRole("superadmin"), TenantController.create);

/**
 * @swagger
 * /api/tenants/update/{id}:
 *   put:
 *     summary: Actualiza un tenant
 *     tags: [Tenants]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Tenant actualizado
 */
router.put("/update/:id", verifyJWT, requireRole("superadmin"), TenantController.update);

/**
 * @swagger
 * /api/tenants/delete/{id}:
 *   delete:
 *     summary: Elimina un tenant
 *     tags: [Tenants]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Tenant eliminado
 */
router.delete("/delete/:id", verifyJWT, requireRole("superadmin"), TenantController.delete);

module.exports = router;

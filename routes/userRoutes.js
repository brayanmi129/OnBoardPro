const express = require("express");
const router = express.Router();
const UserController = require("../controllers/userController");
const verifyJWT = require("../middlewares/jwt.js");
const requireRole = require("../middlewares/requireRole.js");

/**
 * @swagger
 * tags:
 *   name: Usuarios
 *   description: Endpoints relacionados con la gestión de usuarios
 */

/**
 * @swagger
 * /api/users/get/all:
 *   get:
 *     summary: Lista los usuarios de la organización, con filtros
 *     tags: [Usuarios]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: rol
 *         schema: { type: string, enum: [student, instructor, admin, superadmin] }
 *       - in: query
 *         name: estado
 *         schema: { type: string, enum: [Active, Inactive] }
 *       - in: query
 *         name: buscar
 *         description: Coincidencia parcial en nombre, apellido o correo.
 *         schema: { type: string }
 *       - in: query
 *         name: pagina
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: porPagina
 *         schema: { type: integer, default: 50, maximum: 200 }
 *     description: >
 *       El cuerpo es el array de siempre. La paginación viaja en cabeceras:
 *       `X-Total-Count`, `X-Page`, `X-Per-Page` y `X-Total-Pages`.
 *     responses:
 *       200:
 *         description: Lista de usuarios sin contraseñas
 *       403:
 *         description: Sin permisos
 */
// El instructor lo lee para saber a quien tiene en sus cursos. El listado ya
// viene filtrado por organizacion, asi que no ve gente de otra empresa, y
// crear, editar y borrar siguen siendo de admin para arriba.
router.get(
  "/get/all",
  verifyJWT,
  requireRole("admin", "superadmin", "instructor"),
  UserController.getAll
);

/**
 * @swagger
 * /api/users/get/email/{email}:
 *   get:
 *     summary: Obtiene un usuario por su correo electrónico
 *     tags: [Usuarios]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: email
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Usuario encontrado
 *       404:
 *         description: Usuario no encontrado
 */
router.get(
  "/get/email/:email",
  verifyJWT,
  requireRole("admin", "superadmin"),
  UserController.getByEmail
);

/**
 * @swagger
 * /api/users/get/id/{id}:
 *   get:
 *     summary: Obtiene un usuario por su ID
 *     tags: [Usuarios]
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
 *         description: Usuario encontrado
 *       404:
 *         description: >
 *           El usuario no existe o es de otra organización (las dos respuestas
 *           son iguales a propósito). Solo el superadmin ve usuarios de
 *           cualquier organización.
 */
router.get("/get/id/:id", verifyJWT, UserController.getById);

/**
 * @swagger
 * /api/users/get/role/{role}:
 *   get:
 *     summary: Obtiene todos los usuarios con un rol específico
 *     tags: [Usuarios]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: role
 *         required: true
 *         schema:
 *           type: string
 *           enum: [student, instructor, admin, superadmin]
 *     responses:
 *       200:
 *         description: Lista de usuarios con ese rol
 *       404:
 *         description: No se encontraron usuarios con ese rol
 */
router.get(
  "/get/role/:role",
  verifyJWT,
  requireRole("admin", "superadmin"),
  UserController.getByRole
);

/**
 * @swagger
 * /api/users/create:
 *   post:
 *     summary: Crea un nuevo usuario en el tenant
 *     tags: [Usuarios]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               firstname:
 *                 type: string
 *                 example: Juan
 *               lastname:
 *                 type: string
 *                 example: Pérez
 *               email:
 *                 type: string
 *                 example: juan@ucentral.edu.co
 *               password:
 *                 type: string
 *                 example: contraseña123
 *               role:
 *                 type: string
 *                 enum: [student, instructor, admin, superadmin]
 *                 default: student
 *                 description: Solo un superadmin puede crear otro superadmin.
 *               phonumber:
 *                 type: string
 *                 example: "+57 300 0000000"
 *               status:
 *                 type: string
 *                 enum: [Active, Inactive]
 *                 default: Active
 *               level:
 *                 type: integer
 *                 default: 0
 *               xp:
 *                 type: integer
 *                 default: 0
 *               streak:
 *                 type: integer
 *               average:
 *                 type: number
 *                 minimum: 0
 *                 maximum: 5
 *               missions:
 *                 type: string
 *                 example: "0/0"
 *     responses:
 *       201:
 *         description: Usuario creado correctamente
 *       400:
 *         description: Error de validación
 *       403:
 *         description: Sin permisos
 */
router.post("/create", verifyJWT, requireRole("admin", "superadmin"), UserController.create);

/**
 * @swagger
 * /api/users/delete/{id}:
 *   delete:
 *     summary: Elimina un usuario por su ID
 *     tags: [Usuarios]
 *     description: >
 *       Un administrador solo elimina personas de su organización. A un
 *       superadmin solo lo elimina otro superadmin.
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
 *         description: Usuario eliminado correctamente
 *       403:
 *         description: Un administrador intentó eliminar a un superadmin
 *       404:
 *         description: Usuario no encontrado o de otra organización
 */
router.delete("/delete/:id", verifyJWT, requireRole("admin", "superadmin"), UserController.deleteUser);

/**
 * @swagger
 * /api/users/update/{id}:
 *   put:
 *     summary: Actualiza los datos de un usuario
 *     tags: [Usuarios]
 *     description: >
 *       Solo cambia lo que se envía. El id y la organización no se editan, el
 *       correo se guarda en minúsculas y la respuesta nunca incluye la
 *       contraseña.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               firstname:
 *                 type: string
 *               lastname:
 *                 type: string
 *               role:
 *                 type: string
 *                 enum: [student, admin, instructor]
 *               status:
 *                 type: string
 *                 enum: [Active, Inactive]
 *     responses:
 *       200:
 *         description: Usuario actualizado correctamente (updatedData sin contraseña)
 *       400:
 *         description: Error de validación, o se intentó cambiar el id
 *       403:
 *         description: Un administrador intentó asignar el rol superadmin o modificar a un superadmin
 *       404:
 *         description: Usuario no encontrado o de otra organización
 */
router.put("/update/:id", verifyJWT, requireRole("admin", "superadmin"), UserController.updateUser);

module.exports = router;

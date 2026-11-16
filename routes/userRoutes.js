const express = require("express");
const router = express.Router();
const UserController = require("../controllers/userController");
const verifyJWT = require("../middlewares/jwt.js");
const requireRole = require("../middlewares/requireRole.js");
const subida = require("../middlewares/subida.js");
const { soloLectura, soloCreaAdministradores } = require("../middlewares/soloLectura.js");

const administra = requireRole("admin", "superadmin");

/**
 * @swagger
 * /api/users/import/plantilla:
 *   get:
 *     summary: Descarga la plantilla CSV para la carga masiva de usuarios
 *     tags: [Usuarios]
 *     description: >
 *       CSV en UTF-8 con BOM (para que Excel respete tildes y eñes) con las
 *       columnas nombre, apellido, correo, rol, telefono y grupo, y dos filas
 *       de ejemplo.
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: plantilla-usuarios.csv
 *         content:
 *           text/csv:
 *             schema: { type: string }
 *       403:
 *         description: Quien llama no es administrador
 */
router.get("/import/plantilla", verifyJWT, administra, UserController.plantillaImportacion);

/**
 * @swagger
 * components:
 *   schemas:
 *     ArchivoImportacion:
 *       type: object
 *       required: [archivo]
 *       properties:
 *         archivo:
 *           type: string
 *           format: binary
 *           description: .csv o .xlsx, máximo 2 MB y 1000 filas de datos.
 *         tenantId:
 *           type: string
 *           description: Solo el superadmin, para elegir la organización.
 */

/**
 * @swagger
 * /api/users/import/preview:
 *   post:
 *     summary: Valida un archivo de usuarios sin guardar nada
 *     tags: [Usuarios]
 *     description: >
 *       Lee el archivo (primera fila = encabezados) y devuelve cada fila con
 *       sus errores. `fila` es el número de fila en el archivo: la primera de
 *       datos es la 2.
 *
 *       Reglas: nombre y correo obligatorios; correo válido; rol aprendiz /
 *       student o instructor (vacío = aprendiz); el grupo, si viene, tiene que
 *       existir en la organización (por nombre, sin distinguir mayúsculas).
 *       `duplicado` indica que el correo ya está registrado en la plataforma o
 *       que se repite en el archivo (se marca la segunda aparición).
 *
 *       En el resumen, `validas` son las que se crearían al importar: sin
 *       errores y sin duplicar.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             $ref: '#/components/schemas/ArchivoImportacion'
 *     responses:
 *       200:
 *         description: Filas validadas y resumen
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 filas:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       fila: { type: integer, example: 2 }
 *                       datos:
 *                         type: object
 *                         properties:
 *                           firstname: { type: string }
 *                           lastname: { type: string }
 *                           email: { type: string }
 *                           role: { type: string, example: student }
 *                           phonumber: { type: string }
 *                           grupo: { type: string }
 *                       errores:
 *                         type: array
 *                         items: { type: string }
 *                         example: ["El grupo Ventas no existe"]
 *                       duplicado: { type: boolean }
 *                 resumen:
 *                   type: object
 *                   properties:
 *                     total: { type: integer }
 *                     validas: { type: integer }
 *                     conErrores: { type: integer }
 *                     duplicadas: { type: integer }
 *       400:
 *         description: >
 *           Sin archivo, tipo no permitido, más de 2 MB, vacío, sin las columnas
 *           nombre y correo, más de 1000 filas, o superadmin sin tenantId
 *       403:
 *         description: Quien llama no es administrador; o el superadministrador solo consulta las organizaciones
 *       404:
 *         description: La organización indicada no existe
 */
router.post("/import/preview", verifyJWT, administra, soloLectura, subida.planilla, UserController.previsualizarImportacion);

/**
 * @swagger
 * /api/users/import:
 *   post:
 *     summary: Crea los usuarios válidos de un archivo
 *     tags: [Usuarios]
 *     description: >
 *       Vuelve a validar el archivo con las mismas reglas que la vista previa
 *       y crea solo las filas sin errores ni duplicados, en la organización de
 *       quien llama (o la indicada por el superadmin), activas y sin
 *       contraseña: entran con Google o Microsoft, o la definen con "olvidé mi
 *       contraseña". Si la fila trae grupo, se agrega a ese grupo.
 *
 *       Las filas que no se crean van en `omitidas` con su motivo; una fila
 *       que falla al guardarse no corta las demás.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             $ref: '#/components/schemas/ArchivoImportacion'
 *     responses:
 *       200:
 *         description: Resultado de la importación
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string, example: Se crearon 48 usuarios. }
 *                 creados: { type: integer, example: 48 }
 *                 conGrupo: { type: integer, example: 30 }
 *                 omitidas:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       fila: { type: integer }
 *                       email: { type: string, nullable: true }
 *                       motivo: { type: string, example: El correo ya está registrado. }
 *       400:
 *         description: Archivo inválido (mismos casos que la vista previa)
 *       403:
 *         description: Quien llama no es administrador; o el superadministrador solo consulta las organizaciones
 *       404:
 *         description: La organización indicada no existe
 */
router.post("/import", verifyJWT, administra, soloLectura, subida.planilla, UserController.importar);

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
 *       Cada usuario trae `tenantName` y `ultimaConexion`: el último día
 *       (hora de Colombia) en que usó la plataforma, o null si nunca.
 *     responses:
 *       200:
 *         description: Lista de usuarios sin contraseñas
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id: { type: string }
 *                   firstname: { type: string }
 *                   lastname: { type: string }
 *                   email: { type: string }
 *                   role: { type: string }
 *                   status: { type: string }
 *                   tenantId: { type: string, nullable: true }
 *                   tenantName: { type: string, nullable: true }
 *                   ultimaConexion: { type: string, format: date, nullable: true }
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
 *     description: >
 *       El administrador crea aprendices, instructores y administradores de su
 *       organización. El superadministrador solo crea administradores, en la
 *       organización que indique con `tenantId`. Nadie crea superadministradores
 *       por aquí. XP, nivel, racha, promedio y misiones se ganan usando la
 *       plataforma: si llegan en el cuerpo se ignoran y el usuario arranca en cero.
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
 *                 description: >
 *                   Contraseña temporal: la persona tendrá que cambiarla en su
 *                   primer ingreso. Sin contraseña, entra con Google o Microsoft
 *                   o la define con "olvidé mi contraseña".
 *               role:
 *                 type: string
 *                 enum: [student, instructor, admin]
 *                 default: student
 *                 description: El superadministrador solo puede enviar admin.
 *               tenantId:
 *                 type: string
 *                 description: Solo superadministrador (obligatorio para él); el administrador crea en su organización.
 *               phonumber:
 *                 type: string
 *                 example: "+57 300 0000000"
 *               status:
 *                 type: string
 *                 enum: [Active, Inactive]
 *                 default: Active
 *     responses:
 *       201:
 *         description: Usuario creado correctamente
 *       400:
 *         description: Error de validación, o el superadministrador no indicó la organización
 *       403:
 *         description: Sin permisos, se pidió el rol superadmin, o el superadministrador intentó crear algo distinto de un administrador
 */
router.post("/create", verifyJWT, requireRole("admin", "superadmin"), soloCreaAdministradores, UserController.create);

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
 *         description: Un administrador intentó eliminar a un superadmin; o el superadministrador solo consulta las organizaciones
 *       404:
 *         description: Usuario no encontrado o de otra organización
 */
router.delete("/delete/:id", verifyJWT, requireRole("admin", "superadmin"), soloLectura, UserController.deleteUser);

/**
 * @swagger
 * /api/users/update/{id}:
 *   put:
 *     summary: Actualiza los datos de un usuario
 *     tags: [Usuarios]
 *     description: >
 *       Solo cambia lo que se envía. El id y la organización no se editan, el
 *       correo se guarda en minúsculas y la respuesta nunca incluye la
 *       contraseña. Una contraseña puesta aquí a otra persona es temporal:
 *       tendrá que cambiarla en su próximo ingreso. XP, nivel, racha, promedio
 *       y misiones no se editan (se ignoran) y nadie asciende a superadministrador.
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
 *         description: Se intentó asignar el rol superadmin, un administrador intentó modificar a un superadmin, o el superadministrador solo consulta las organizaciones
 *       404:
 *         description: Usuario no encontrado o de otra organización
 */
router.put("/update/:id", verifyJWT, requireRole("admin", "superadmin"), soloLectura, UserController.updateUser);

module.exports = router;

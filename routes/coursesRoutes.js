const express = require("express");
const router = express.Router();
const CourseController = require("../controllers/courseController");
const verifyToken = require("../middlewares/jwt.js");
const requireRole = require("../middlewares/requireRole.js");
const subida = require("../middlewares/subida.js");

/**
 * @swagger
 * tags:
 *   name: Cursos
 *   description: Endpoints relacionados con cursos y sus usuarios
 */

/**
 * @swagger
 * /api/courses/get/all:
 *   get:
 *     summary: Obtiene todos los cursos
 *     tags: [Cursos]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: buscar
 *         description: Coincidencia parcial en el nombre del curso.
 *         schema: { type: string }
 *       - in: query
 *         name: estado
 *         schema: { type: string, enum: [Abierto, Cerrado] }
 *       - in: query
 *         name: archivados
 *         description: >
 *           Por defecto no vienen los cursos archivados. `incluir` los suma y
 *           `solo` trae únicamente los archivados. Un aprendiz nunca los ve.
 *         schema: { type: string, enum: [incluir, solo] }
 *       - in: query
 *         name: pagina
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: porPagina
 *         schema: { type: integer, default: 50, maximum: 200 }
 *     description: >
 *       El cuerpo es el array de siempre. La paginación viaja en cabeceras:
 *       `X-Total-Count`, `X-Page`, `X-Per-Page` y `X-Total-Pages`.
 *       Un instructor recibe únicamente los cursos que tiene asignados;
 *       el filtro es automático y no se puede desactivar.
 *     responses:
 *       200:
 *         description: Lista de todos los cursos
 */
router.get("/get/all", verifyToken, CourseController.getAll);

/**
 * @swagger
 * /api/courses/get/id/{id}:
 *   get:
 *     summary: Obtiene un curso por su ID
 *     tags: [Cursos]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID del curso
 *     responses:
 *       200:
 *         description: Curso encontrado
 *       404:
 *         description: Curso no encontrado
 */
router.get("/get/id/:id", verifyToken, CourseController.getById);

/**
 * @swagger
 * /api/courses/create:
 *   post:
 *     summary: Crea un nuevo curso
 *     tags: [Cursos]
 *     description: >
 *       El curso queda en la empresa del usuario autenticado; `tenantId` se toma
 *       del token y se ignora si viene en el cuerpo. El `id` lo genera el
 *       servidor. La portada se sube después con POST /api/courses/{id}/banner.
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
 *               - instructor
 *             properties:
 *               name:
 *                 type: string
 *                 maxLength: 50
 *                 example: Inducción para nuevos ingresos
 *               instructor:
 *                 type: string
 *                 format: email
 *                 description: Correo del instructor a cargo.
 *                 example: instructor@empresa.com
 *               grupo:
 *                 type: string
 *                 description: Id del equipo al que se asigna el curso.
 *                 example: grp-uc-a
 *               status:
 *                 type: string
 *                 enum: [Abierto, Cerrado]
 *                 default: Abierto
 *               actividades:
 *                 type: array
 *                 items: { type: string }
 *                 description: Ids de actividades ya creadas.
 *     responses:
 *       201:
 *         description: Curso creado correctamente
 *       400:
 *         description: Error en los datos o validación fallida
 */
router.post("/create", verifyToken, requireRole("admin", "superadmin", "instructor"), CourseController.create);

/**
 * @swagger
 * /api/courses/update/{id}:
 *   put:
 *     summary: Edita un curso
 *     tags: [Cursos]
 *     description: >
 *       Solo cambia los campos que se envían. La organización y el id
 *       no se editan.
 *
 *       Un instructor solo edita los cursos que dicta y no puede reasignar el
 *       instructor. Al reasignarlo, el correo tiene que ser de un instructor o
 *       administrador de la misma organización.
 *
 *       Pasar `status` a `Abierto` es publicar: un curso sin actividades no se
 *       puede publicar.
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
 *               name:       { type: string, maxLength: 50 }
 *               instructor: { type: string, format: email }
 *               grupo:      { type: string, nullable: true }
 *               status:     { type: string, enum: [Abierto, Cerrado] }
 *     responses:
 *       200:
 *         description: Curso actualizado, devuelve el curso
 *       400:
 *         description: Datos inválidos, no se envió nada, o el instructor no es válido
 *       403:
 *         description: El instructor no dicta este curso o intentó reasignarlo
 *       404:
 *         description: El curso no existe o es de otra organización
 *       409:
 *         description: Se intentó publicar un curso sin actividades
 */
router.put("/update/:id", verifyToken, requireRole("admin", "superadmin", "instructor"), CourseController.update);

/**
 * @swagger
 * /api/courses/{id}/instructor:
 *   put:
 *     summary: Cambia el instructor de un curso
 *     tags: [Cursos]
 *     description: >
 *       Solo administradores. `instructor` puede ser el correo o el id
 *       de la persona, que tiene que ser un instructor o administrador activo
 *       de la organización del curso.
 *
 *       El contenido que armó el instructor anterior se queda en el curso, y
 *       las entregas pendientes pasan a revisarlas quien llega. El nuevo
 *       instructor recibe un correo avisándole.
 *
 *       Para ver a quién se puede asignar: GET /api/users/get/role/instructor.
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
 *             required: [instructor]
 *             properties:
 *               instructor:
 *                 type: string
 *                 description: Correo o id del nuevo instructor.
 *                 example: instructor@empresa.com
 *     responses:
 *       200:
 *         description: Devuelve message, anterior (correo) e instructor
 *       400:
 *         description: Falta el instructor, no existe en la organización, no puede dictar o está desactivado
 *       403:
 *         description: Quien llama no es administrador
 *       404:
 *         description: El curso no existe o es de otra organización
 */
router.put("/:id/instructor", verifyToken, requireRole("admin", "superadmin"), CourseController.asignarInstructor);

/**
 * @swagger
 * /api/courses/{id}/impacto:
 *   get:
 *     summary: Qué se pierde si se borra el curso
 *     tags: [Cursos]
 *     description: >
 *       Para mostrar en la confirmación antes de archivar o borrar: cuántos
 *       aprendices lo tienen asignado (por sus grupos), cuántas secciones,
 *       actividades, entregas e intentos de examen tiene, y cuántas
 *       actividades ya completó la gente.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: >
 *           Devuelve curso, aprendices, grupos, secciones, actividades,
 *           entregas, intentosDeExamen y actividadesCompletadas
 *       403:
 *         description: El instructor no dicta este curso
 *       404:
 *         description: El curso no existe o es de otra organización
 */
router.get("/:id/impacto", verifyToken, requireRole("admin", "superadmin", "instructor"), CourseController.impacto);

/**
 * @swagger
 * /api/courses/{id}/archivar:
 *   put:
 *     summary: Archiva o desarchiva un curso
 *     tags: [Cursos]
 *     description: >
 *       Es la opción recomendada antes que borrar. Un curso archivado desaparece
 *       para los aprendices (de "mis cursos", de sus pendientes, no se puede
 *       abrir ni rendir) y sale del listado de cursos, pero conserva todo:
 *       secciones, entregas, intentos y el XP ganado. Se puede desarchivar.
 *
 *       Para ver los archivados: GET /api/courses/get/all?archivados=solo.
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
 *             required: [archivado]
 *             properties:
 *               archivado: { type: boolean }
 *     responses:
 *       200:
 *         description: Devuelve message y archivado
 *       400:
 *         description: Falta `archivado` o no es booleano
 *       403:
 *         description: El instructor no dicta este curso
 *       404:
 *         description: El curso no existe o es de otra organización
 */
router.put("/:id/archivar", verifyToken, requireRole("admin", "superadmin", "instructor"), CourseController.archivar);

/**
 * @swagger
 * /api/courses/delete/{id}:
 *   delete:
 *     summary: Elimina un curso para siempre, con todo su contenido
 *     tags: [Cursos]
 *     description: >
 *       Solo administradores. Borra el curso, sus secciones, sus actividades y
 *       todo lo que cuelga de ellas (material, entregas, preguntas, intentos),
 *       incluidos los archivos guardados: la portada, el material de apoyo y
 *       los archivos entregados. No se puede deshacer.
 *
 *       El XP que la gente ya ganó con el curso se conserva.
 *
 *       Si el curso ya no se dicta pero se quiere conservar el histórico,
 *       conviene archivarlo (PUT /api/courses/{id}/archivar).
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Devuelve message, actividades borradas y archivosBorrados
 *       403:
 *         description: Quien llama no es administrador
 *       404:
 *         description: El curso no existe o es de otra organización
 */
router.delete("/delete/:id", verifyToken, requireRole("admin", "superadmin"), CourseController.eliminar);

/**
 * @swagger
 * /api/courses/{id}/publicar:
 *   put:
 *     summary: Publica o despublica un curso
 *     tags: [Cursos]
 *     description: >
 *       Un curso despublicado (`status: Cerrado`) desaparece para el
 *       aprendiz: no sale en "mis cursos", no se puede abrir, y no se pueden
 *       completar actividades, entregar ni rendir exámenes en él. Quien lo
 *       arma sí lo sigue viendo, para probarlo antes de abrirlo.
 *
 *       Despublicar no borra el progreso ni el XP ganado.
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
 *             required: [publicado]
 *             properties:
 *               publicado: { type: boolean }
 *     responses:
 *       200:
 *         description: Devuelve message y el status resultante
 *       400:
 *         description: Falta `publicado` o no es booleano
 *       403:
 *         description: El instructor no dicta este curso
 *       409:
 *         description: Se intentó publicar un curso sin actividades
 */
router.put("/:id/publicar", verifyToken, requireRole("admin", "superadmin", "instructor"), CourseController.publicar);

/**
 * @swagger
 * /api/courses/me:
 *   get:
 *     summary: Obtiene los cursos del usuario autenticado
 *     tags: [Cursos]
 *     security:
 *       - bearerAuth: []   # Requiere token JWT
 *     responses:
 *       200:
 *         description: Lista de cursos asociados al usuario autenticado
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: string
 *                     example: "abc123"
 *                   name:
 *                     type: string
 *                     example: "Introducción a la programación"
 *                   description:
 *                     type: string
 *                     example: "Curso básico de fundamentos de programación"
 *                   image:
 *                     type: string
 *                     example: "https://example.com/course-image.jpg"
 *       401:
 *         description: No autorizado. El token JWT es inválido o no fue enviado
 *       500:
 *         description: Error interno del servidor
 */
router.get("/me", verifyToken, CourseController.getMyCourses);

/**
 * @swagger
 * /api/courses/{id}/banner:
 *   post:
 *     summary: Sube o reemplaza la portada de un curso
 *     tags: [Cursos]
 *     description: >
 *       Recibe una imagen en multipart/form-data bajo el campo `banner`.
 *       Máximo 5 MB, solo JPEG, PNG, WebP o GIF. Queda en el bucket público
 *       "banners" de Supabase Storage y la portada anterior se borra.
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
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               banner:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Portada actualizada, devuelve bannerUrl
 *       400:
 *         description: Sin archivo, tipo no permitido o supera los 5 MB
 *       404:
 *         description: El curso no existe o es de otra empresa
 */
router.post(
  "/:id/banner",
  verifyToken,
  requireRole("admin", "superadmin", "instructor"),
  subida.banner,
  CourseController.subirBanner
);

module.exports = router;

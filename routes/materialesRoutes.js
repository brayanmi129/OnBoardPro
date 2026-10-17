const express = require("express");
const router = express.Router();
const MaterialService = require("../services/materialService.js");
const verifyJWT = require("../middlewares/jwt.js");
const requireRole = require("../middlewares/requireRole.js");
const subida = require("../middlewares/subida.js");

// Quien dicta o administra sube y quita material; el resto solo lo consulta.
const puedeEditar = requireRole("admin", "superadmin", "instructor");

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
 *   name: Material de apoyo
 *   description: >
 *     Archivos de una actividad. Una actividad puede tener varios: subir uno
 *     nuevo no reemplaza a los anteriores. Viven en un bucket privado, así que
 *     cada consulta devuelve enlaces firmados que vencen en una hora.
 */

/**
 * @swagger
 * /api/activities/{id}/materiales:
 *   get:
 *     summary: El material de apoyo de una actividad
 *     tags: [Material de apoyo]
 *     description: >
 *       Devuelve cada archivo con su nombre original, tipo, tamaño y una URL
 *       temporal para abrirlo o descargarlo. La ruta interna del bucket no se
 *       expone nunca.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Id de la actividad.
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Lista de materiales, ordenada como se cargaron
 *       404:
 *         description: La actividad no existe o es de otra organización
 */
router.get("/activities/:id/materiales", verifyJWT, async (req, res) => {
  try {
    return res.status(200).json(await MaterialService.listar(req.params.id, actorDe(req)));
  } catch (error) {
    return responder(res, error, "Error al listar el material");
  }
});

/**
 * @swagger
 * /api/activities/{id}/materiales:
 *   post:
 *     summary: Agrega un archivo a la actividad
 *     tags: [Material de apoyo]
 *     description: >
 *       Se envía como multipart/form-data con el archivo en el campo
 *       `archivo` (imagen, PDF o video, hasta 50 MB). Se agrega al final de la
 *       lista: no reemplaza a los que ya estaban.
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
 *             required: [archivo]
 *             properties:
 *               archivo: { type: string, format: binary }
 *     responses:
 *       201:
 *         description: Material agregado
 *       400:
 *         description: No se envió ningún archivo
 *       403:
 *         description: La actividad no pertenece a un curso que dicte el instructor
 *       404:
 *         description: La actividad no existe o es de otra organización
 */
router.post(
  "/activities/:id/materiales",
  verifyJWT,
  puedeEditar,
  subida.material,
  async (req, res) => {
    try {
      const r = await MaterialService.agregar(req.params.id, actorDe(req), req.file);
      return res.status(201).json(r);
    } catch (error) {
      return responder(res, error, "Error al agregar el material");
    }
  }
);

/**
 * @swagger
 * /api/materiales/{id}:
 *   delete:
 *     summary: Quita un archivo de la actividad
 *     tags: [Material de apoyo]
 *     description: >
 *       Borra el archivo del almacenamiento y no solo su referencia: si se
 *       eliminara nada más la fila, el archivo obsoleto seguiría en el bucket.
 *
 *       La confirmación la pide la interfaz; acá la operación ya es definitiva.
 *       Un instructor solo quita material de los cursos que dicta.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Id del material, no el de la actividad.
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Material eliminado
 *       403:
 *         description: La actividad no pertenece a un curso que dicte el instructor
 *       404:
 *         description: El material no existe
 */
router.delete("/materiales/:id", verifyJWT, puedeEditar, async (req, res) => {
  try {
    return res.status(200).json(await MaterialService.quitar(req.params.id, actorDe(req)));
  } catch (error) {
    return responder(res, error, "Error al quitar el material");
  }
});

module.exports = router;

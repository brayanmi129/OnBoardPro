const GroupService = require("../services/groupService.js");
const zod = require("zod");

// El tenant sale SIEMPRE del JWT, nunca del body: si viniera del cliente,
// cualquiera podría crear o leer en la empresa que quisiera. El superadmin es la
// única excepción y usa null, que en los servicios significa "sin filtro".
function tenantDe(req) {
  return req.user.role === "superadmin" ? null : req.user.tenantId;
}

class GroupController {
  // 🟢 Crear grupo
  static async create(req, res) {
    try {
      const tenantId =
        req.user.role === "superadmin" ? req.body.tenantId || null : req.user.tenantId;
      const group = await GroupService.create({ ...req.body, tenantId });
      res.status(201).json(group);
    } catch (error) {
      console.error("Error al crear el grupo:", error.message);
      if (error instanceof zod.ZodError) {
        res.status(400).json({ error: "Datos inválidos", details: error.errors });
      } else {
        res.status(500).json({ error: error.message });
      }
    }
  }

  // 🟢 Obtener todos los grupos
  static async getAll(req, res) {
    try {
      const groups = await GroupService.getAll(tenantDe(req));
      res.status(200).json(groups);
    } catch (error) {
      console.error("Error al obtener los grupos:", error);
      res.status(500).send("Error al obtener los grupos");
    }
  }

  // 🟢 Obtener grupo por ID
  static async getById(req, res) {
    try {
      const { id } = req.params;
      const group = await GroupService.getById(id, tenantDe(req));
      if (!group) return res.status(404).send("Grupo no encontrado");
      res.status(200).json(group);
    } catch (error) {
      console.error("Error al obtener el grupo:", error);
      res.status(500).send("Error interno del servidor");
    }
  }

  // 🟢 Agregar usuarios a un grupo
  static async addUsers(req, res) {
    try {
      const { id } = req.params;
      const { userIds } = req.body;
      const result = await GroupService.addUsersToGroup(id, userIds, tenantDe(req));
      res.status(200).json(result);
    } catch (error) {
      console.error("Error al agregar usuarios al grupo:", error);
      res.status(400).json({ error: error.message });
    }
  }

  // 🟡 Eliminar usuarios de un grupo
  static async removeUsers(req, res) {
    try {
      const { id } = req.params;
      const { userIds } = req.body;
      if (!Array.isArray(userIds) || userIds.length === 0)
        return res.status(400).json({ error: "Debe enviar una lista de userIds" });

      const result = await GroupService.removeUsersFromGroup(id, userIds, tenantDe(req));
      res.status(200).json(result);
    } catch (error) {
      console.error("Error al eliminar usuarios del grupo:", error);
      res.status(400).json({ error: error.message });
    }
  }

  // 🟠 Actualizar grupo
  static async update(req, res) {
    try {
      const { id } = req.params;
      const updateData = req.body;
      const response = await GroupService.updateGroup(id, updateData, tenantDe(req));

      if (response.error) return res.status(400).json(response);
      res.status(200).json(response);
    } catch (error) {
      console.error("Error al actualizar el grupo:", error);
      if (error instanceof zod.ZodError) {
        res.status(400).json({ error: "Datos inválidos", details: error.errors });
      } else {
        res.status(500).json({ error: error.message });
      }
    }
  }

  // 🔴 Eliminar grupo
  static async delete(req, res) {
    try {
      const { id } = req.params;
      if (!id) return res.status(400).send("ID del grupo es requerido");

      await GroupService.deleteGroup(id, tenantDe(req));
      res.status(200).send(`Grupo eliminado ${id} correctamente`);
    } catch (error) {
      console.error("Error al eliminar el grupo:", error);
      res.status(500).send("Error al eliminar el grupo");
    }
  }

  static async getMyGroups(req, res) {
    try {
      if (!req.user || !req.user.id) {
        return res.status(401).json({ error: "No autenticado" });
      }

      const userId = req.user.id;
      const groups = await GroupService.getByUser(userId);
      res.status(200).json(groups);
    } catch (error) {
      console.error("Error al obtener los grupos del usuario:", error);
      res.status(500).json({ error: "Error al obtener los grupos del usuario" });
    }
  }
}

module.exports = GroupController;

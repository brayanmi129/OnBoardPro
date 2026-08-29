const UserService = require("../services/userService.js");
const zod = require("zod");

class UserController {
  static async create(req, res) {
    try {
      // Admin solo puede crear usuarios en su tenant; superadmin puede especificar tenantId
      if (req.body.role === "superadmin" && req.user.role !== "superadmin") {
        return res.status(403).json({ message: "Solo un superadmin puede crear otros superadmins" });
      }

      const tenantId =
        req.user.role === "superadmin" ? req.body.tenantId || req.user.tenantId : req.user.tenantId;

      const user = await UserService.create({ ...req.body, tenantId });
      return res.status(201).json(user);
    } catch (error) {
      if (error instanceof zod.ZodError) {
        return res.status(400).json({ error: "Datos inválidos", details: error.errors });
      }
      return res.status(500).json({ error: error.message });
    }
  }

  static async getAll(req, res) {
    try {
      const tenantId = req.user.role === "superadmin" ? null : req.user.tenantId;
      const users = await UserService.getAll(tenantId);
      return res.status(200).json(users);
    } catch (error) {
      return res.status(500).json({ message: "Error al obtener los usuarios" });
    }
  }

  static async getByEmail(req, res) {
    try {
      const { email } = req.params;
      const tenantId = req.user.role === "superadmin" ? null : req.user.tenantId;
      const user = await UserService.getByEmail(email, tenantId);
      if (!user) return res.status(404).json({ message: "Usuario no encontrado" });
      return res.status(200).json(user);
    } catch (error) {
      return res.status(500).json({ message: "Error interno" });
    }
  }

  static async getById(req, res) {
    try {
      const { id } = req.params;
      const user = await UserService.getById(id);
      if (!user) return res.status(404).json({ message: "Usuario no encontrado" });
      return res.status(200).json(user);
    } catch (error) {
      return res.status(500).json({ message: "Error interno" });
    }
  }

  static async getByRole(req, res) {
    try {
      const { role } = req.params;
      const tenantId = req.user.role === "superadmin" ? null : req.user.tenantId;
      const users = await UserService.getByRole(role, tenantId);
      return res.status(200).json(users);
    } catch (error) {
      return res.status(500).json({ message: "Error interno" });
    }
  }

  static async deleteUser(req, res) {
    try {
      const { id } = req.params;
      await UserService.deleteUser(id);
      return res.status(200).json({ message: `Usuario ${id} eliminado correctamente` });
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  }

  static async updateUser(req, res) {
    try {
      const { id } = req.params;
      const updateData = req.body;

      // Admin no puede escalar roles a superadmin
      if (updateData.role === "superadmin" && req.user.role !== "superadmin") {
        return res.status(403).json({ message: "No puedes asignar el rol superadmin" });
      }

      const response = await UserService.updateUser(id, updateData);
      if (response.error) return res.status(400).json(response);
      return res.status(200).json(response);
    } catch (error) {
      if (error instanceof zod.ZodError) {
        return res.status(400).json({ error: "Datos inválidos", details: error.errors });
      }
      return res.status(500).json({ error: error.message });
    }
  }
}

module.exports = UserController;

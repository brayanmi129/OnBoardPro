const TenantService = require("../services/tenantService.js");

class TenantController {
  static async create(req, res) {
    try {
      const tenant = await TenantService.create(req.body);
      return res.status(201).json(tenant);
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  }

  static async getAll(req, res) {
    try {
      const tenants = await TenantService.getAll();
      return res.status(200).json(tenants);
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  }

  static async getById(req, res) {
    try {
      const tenant = await TenantService.getById(req.params.id);
      if (!tenant) return res.status(404).json({ message: "Tenant no encontrado" });
      return res.status(200).json(tenant);
    } catch (error) {
      return res.status(500).json({ message: error.message });
    }
  }

  static async update(req, res) {
    try {
      const tenant = await TenantService.update(req.params.id, req.body);
      return res.status(200).json(tenant);
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  }

  static async delete(req, res) {
    try {
      await TenantService.delete(req.params.id);
      return res.status(200).json({ message: "Tenant eliminado correctamente" });
    } catch (error) {
      return res.status(400).json({ message: error.message });
    }
  }
}

module.exports = TenantController;

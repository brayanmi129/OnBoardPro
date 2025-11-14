const zod = require("zod");

class GroupSchema {
  // Definir el esquema Zod para validar los datos del grupo
  static schema = zod
    .object({
      id: zod.string().min(1).max(50), // ID obligatorio y con longitud limitada
      name: zod.string().min(1).max(100), // Nombre obligatorio
      description: zod.string().optional(),
    })
    .strict();

  constructor({ id, name, description = "" }) {
    this.id = id;
    this.name = name;
    this.description = description;
  }

  getGroupData() {
    return { ...this };
  }
}

module.exports = GroupSchema;

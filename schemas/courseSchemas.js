const zod = require("zod");

class courseSchema {
  static schema = zod.object({
    id: zod.string().min(1).max(50),
    // La pone el controlador desde el JWT, nunca el cliente.
    tenantId: zod.string().nullable().optional(),
    name: zod.string().min(1).max(50),
    instructor: zod.string().email(),
    grupo: zod.string().min(1).max(50).optional(),
    status: zod.enum(["Cerrado", "Abierto"]).default("Abierto"),
    actividades: zod.array(zod.string()).optional(),
  });

  // Para editar (HU-028): todo opcional y sin valores por defecto, porque un
  // campo que no se envió no se toca. Ni el id ni la empresa se editan.
  static actualizacion = zod.object({
    name: zod.string().trim().min(1).max(50).optional(),
    instructor: zod.string().email().optional(),
    grupo: zod.string().min(1).max(50).nullable().optional(),
    status: zod.enum(["Cerrado", "Abierto"]).optional(),
  });

  constructor({ id, name, instructor, grupo, status, actividades = [] }) {
    this.id = id;
    this.name = name;
    this.instructor = instructor;
    this.grupo = grupo || "Sin grupo";
    this.status = status || "Abierto";
    this.actividades = actividades;
  }
  getData() {
    return { ...this };
  }
}

module.exports = courseSchema;

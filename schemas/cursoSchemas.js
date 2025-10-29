const zod = require("zod");

class courseSchema {
  static schema = zod.object({
    id: zod.string().min(1).max(50),
    name: zod.string().min(1).max(50),
    instructor: zod.string().email(),
    grupo: zod.string().min(1).max(50).optional(),
    status: zod.enum(["Cerrado", "Abierto"]).default("Abierto"),
    actividades: zod.array(zod.string()).optional(),
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

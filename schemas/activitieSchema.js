const zod = require("zod");

class activitieSchema {
  static schema = zod.object({
    id: zod.string().min(1).max(50),
    name: zod.string().min(1).max(50),
    type: zod.enum(["Tarea", "Recurso", "Examen"]).default("Recurso"),
    title: zod.string().min(1).max(100),
    description: zod.string().min(1).max(400).optional(),
    adjunto: zod.string().url(),
    deliverable: zod.boolean().default(false),
  });

  constructor({ id, name, type, title, description, adjunto, deliverable }) {
    this.id = id;
    this.name = name;
    this.type = type || "Recurso";
    this.title = title || "";
    this.description = description || "";
    this.deliverable = deliverable || false;
    this.adjunto = adjunto;
  }
  getData() {
    return { ...this };
  }
}

module.exports = activitieSchema;

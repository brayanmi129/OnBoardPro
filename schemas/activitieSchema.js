const zod = require("zod");

class activitieSchema {
  static schema = zod.object({
    id: zod.string().min(1).max(50),
    name: zod.string().min(1).max(50),
    type: zod.enum(["Tarea", "Recurso", "Examen"]).default("Recurso"),
    title: zod.string().min(1).max(100),
    description: zod.string().min(1).max(400).optional(),
    // Ya no es una URL: con Supabase Storage se guarda la ruta dentro del
    // bucket privado y la URL se firma al momento de leerla. Las actividades
    // viejas tienen acá un enlace de Drive, que también entra como texto.
    adjunto: zod.string().min(1),
    mime: zod.string().max(100).optional(),
    tenantId: zod.string().nullable().optional(),
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

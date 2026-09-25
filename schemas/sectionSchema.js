const zod = require("zod");

class SectionSchema {
  static schema = zod
    .object({
      id: zod.string().min(1).max(50),
      // De qué curso es. Lo pone el controlador desde la URL, no el cuerpo.
      courseId: zod.string().min(1).max(50),
      // La empresa se deduce del curso; el cliente nunca la manda.
      tenantId: zod.string().nullable().optional(),
      name: zod.string().min(1).max(120),
      // Posición dentro del curso. Si no viene, el servicio la calcula para
      // dejar la sección al final.
      orden: zod.number().int().min(0).optional(),
    })
    .strict();
}

module.exports = SectionSchema;

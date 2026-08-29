const zod = require("zod");

class TenantSchema {
  static schema = zod
    .object({
      id: zod.string().min(1).max(50),
      name: zod.string().min(1).max(100),
      domain: zod.string().min(1).max(100),
      active: zod.boolean().default(true),
      createdAt: zod.string().optional(),
    })
    .strict();
}

module.exports = TenantSchema;

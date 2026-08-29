const zod = require("zod");

class UserSchema {
  static schema = zod
    .object({
      id: zod.string().min(1).max(50),
      tenantId: zod.string().nullable().optional(),
      firstname: zod.string().min(1).max(50).optional(),
      lastname: zod.string().optional(),
      phonumber: zod.string().optional(),
      email: zod.string().email(),
      level: zod.number().int().min(0).default(0),
      xp: zod.number().int().min(0).default(0),
      password: zod.string().nullable().optional(),
      role: zod.enum(["student", "admin", "instructor", "superadmin"]).default("student"),
      status: zod.enum(["Active", "Inactive"]).default("Active"),
      average: zod.number().min(0).max(5).optional(),
      missions: zod.string().optional(),
      streak: zod.number().int().min(0).optional(),
    })
    .strict();
}

module.exports = UserSchema;

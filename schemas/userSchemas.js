const zod = require("zod");

class UserSchema {
  // Definir el esquema Zod para validar los datos de usuario
  static schema = zod
    .object({
      id: zod.string().min(1).max(50),
      firstname: zod.string().min(1).max(50).optional(),
      lastname: zod.string().optional(),
      phonumber: zod.string().optional(),
      email: zod.string().email(), // Validar que el correo sea un formato válido
      level: zod.number().int().min(0).default(0),
      xp: zod.number().int().min(0).default(0),
      password: zod.string().optional(), // Contraseña opcional
      role: zod.enum(["student", "admin", "instructor"]).default("student"), // Rol por defecto
      status: zod.enum(["Active", "Inactive"]).default("Active"), // Rol por defecto
      average: zod.number().min(0).max(5).optional(),
      missions: zod.string().optional(),
      streak: zod.number().int().min(0).optional(),
    })
    .strict();

  constructor({
    id,
    firstname = "",
    lastname = "",
    phonumber = "",
    email,
    level = 0,
    password = "",
    rol = "Aprendiz",
    status = "Active",
    average = 0,
    missions = "0/0",
    streak = 0,
  }) {
    this.id = id;
    this.firstname = firstname;
    this.lastname = lastname;
    this.phonumber = phonumber;
    this.email = email;
    this.level = level;
    this.password = password;
    this.rol = rol;
    this.status = status;
    this.average = average;
    this.missions = missions;
    this.streak = streak;
  }

  getUserData() {
    return { ...this };
  }
}

module.exports = UserSchema;

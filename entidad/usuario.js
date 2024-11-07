const zod = require('zod');

class User {
    // Definir el esquema Zod para validar los datos de usuario
    static schema = zod.object({
        username: zod.string().min(1).max(50),
        fisrtname: zod.string().min(1).max(50).optional(),
        lastname: zod.string().min(1).max(50).optional(),
        phonumber: zod.string().min(1).max(50).optional(),
        email: zod.string().email(), // Validar que el correo sea un formato válido
        level: zod.number().int().optional(),
        password: zod.string().optional(), // Contraseña opcional
        courses: zod.array(zod.number().int()).optional(),
        rol: zod.enum(['Aprendiz', 'SuperAdmin', 'Capacitador']).default('Estudiante'), // Rol por defecto
   });

    constructor({username, fisrtname = '', lastname = '', phonumber ='', email, level = 0, password = '', courses = [], rol = 'Aprendiz' }) {
        this.username = username;
        this.fisrtname = fisrtname;
        this.lastname = lastname;
        this.phonumber = phonumber;
        this.email = email;
        this.level = level;
        this.password = password;
        this.courses = courses;
        this.rol = rol;
    }

    // Método para validar una instancia de usuario usando Zod
    static validate(userData) {
        return this.schema.safeParse(userData);
    }

    // Método para obtener los datos del usuario
    getUserData() {
        return {
            username: this.username,
            fisrtname: this.fisrtname,
            lastname: this.lastname,
            phonumber: this.phonumber,
            email: this.email,
            level: this.level,
            password: this.password,
            courses: this.courses,
            rol: this.rol,
        };
    }
}

module.exports = User;

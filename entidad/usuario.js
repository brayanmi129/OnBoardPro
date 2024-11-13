const zod = require('zod');

class User {
    // Definir el esquema Zod para validar los datos de usuario
    static schema = zod.object({
        fisrtname: zod.string().min(1).max(50).optional(),
        lastname: zod.string().optional(),
        phonumber: zod.string().optional(),
        email: zod.string().email(), // Validar que el correo sea un formato válido
        level: zod.number().int().optional(),
        password: zod.string().optional(), // Contraseña opcional
        courses: zod.array(zod.number().int().default('')),
        rol: zod.enum(['Aprendiz', 'SuperAdmin', 'Instructor']).default('Aprendiz'), // Rol por defecto
        group: zod.string().default('onboarding'), // Valor predeterminado si no se define
        status: zod.enum(['Active', 'Inactive']).default('Active'), // Rol por defecto
   });

    constructor({ fisrtname = '', lastname = '', phonumber ='', email, level = 0, password = '', courses = [], rol = 'Aprendiz' , status = 'Active' , group = 'onboarding'}) {
        this.fisrtname = fisrtname;
        this.lastname = lastname;
        this.phonumber = phonumber;
        this.email = email;
        this.level = level;
        this.password = password;
        this.courses = courses;
        this.group = group;
        this.rol = rol;
        this.status = status;
    }

    // Método para validar una instancia de usuario usando Zod
    static validate(userData) {
        return this.schema.safeParse(userData);
    }

    // Método para obtener los datos del usuario
    getUserData() {
        return { ...this };
    }
    
}

module.exports = User;

const zod = require('zod');

class UserSchema {
    // Definir el esquema Zod para validar los datos de usuario
    static schema = zod.object({
        id: zod.string().min(1).max(50),
        fisrtname: zod.string().min(1).max(50).optional(),
        lastname: zod.string().optional(),
        phonumber: zod.string().optional(),
        email: zod.string().email(), // Validar que el correo sea un formato válido
        level: zod.number().int().optional(),
        password: zod.string().optional(), // Contraseña opcional
        rol: zod.enum(['Aprendiz', 'Administrador', 'Instructor']).default('Aprendiz'), // Rol por defecto
        group: zod.string().default('onboarding'), // Valor predeterminado si no se define
        status: zod.enum(['Active', 'Inactive']).default('Active'), // Rol por defecto
   });

    constructor({ id ,fisrtname = '', lastname = '', phonumber ='', email, level = 0, password = '', rol = 'Aprendiz' , status = 'Active' , group = 'onboarding'}) {
        this.id = id;
        this.fisrtname = fisrtname;
        this.lastname = lastname;
        this.phonumber = phonumber;
        this.email = email;
        this.level = level;
        this.password = password;
        this.group = group;
        this.rol = rol;
        this.status = status;
    }

    getUserData() {
        return { ...this };
    }

}

module.exports = UserSchema;
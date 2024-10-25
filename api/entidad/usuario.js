const zod = require('zod');

class User {
    // Definir el esquema Zod para validar los datos de usuario
    static schema = zod.object({
        username: zod.string().min(1).max(50),
        email: zod.string().email(), // Validar que el correo sea un formato válido
        password: zod.string().optional(), // Contraseña opcional
        rol: zod.string(zod.enum('Estudiante', 'SuperAdmin', 'Profesor')).min(1).default(['Estudiante']), // Rol por defecto
    });

    constructor({ username, email, password = '', rol = 'Estudiante' }) {
        this.username = username;
        this.email = email;
        this.password = password;
        this.rol = rol;
    }

    // Método para validar una instancia de usuario usando Zod
    static validate(userData) {
        console.log(userData , this.schema)
        return this.schema.safeParse(userData);
    }

    // Método para obtener los datos del usuario
    getUserData() {
        console.log("Thisssss: " , this)
        return {
            username: this.username,
            email: this.email,
            password: this.password,
            rol: this.rol,
        };
    }
}

module.exports = User;

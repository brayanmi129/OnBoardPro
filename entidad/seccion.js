const zod = require('zod');

class Seccion {
    // Definir el esquema Zod para validar los datos de usuario
    static schema = zod.object({
        id: zod.string().min(1).max(50),
        IdCourse: zod.string().min(1).max(50),
        name: zod.string().min(1).max(50),
    });

    constructor({ id , name, Instructor, material = [], entregas = [] , status = 'Abierto'}) {
        this.id = id;
        this.name = name;
        this.Instructor = Instructor;
        this.grupo = grupo;
        this.status = status
    }

    // Método para validar una instancia de usuario usando Zod
    static validate(cursoData) {
        return this.schema.safeParse(cursoData);
    }

    // Método para obtener los datos del usuario
    getCourseData() {
        return {...this};
    }
}

module.exports = Course;

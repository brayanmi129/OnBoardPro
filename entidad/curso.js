const zod = require('zod');

class Course {
    // Definir el esquema Zod para validar los datos de usuario
    static schema = zod.object({
        name: zod.string().min(1).max(50),
        Instructor: zod.string().email(),
        aprendices: zod.array(zod.string().email()), // array de aprendices
        material: zod.array(zod.number().int()),
        entregas: zod.array(zod.number().int()),
        status: zod.enum(['En curso', 'Cerrado','Abierto']).default('Abierto'), // Rol por defecto
    });

    constructor({ name, Instructor, aprendices = [], material = [], entregas = [] , status = 'Abierto'}) {
        this.name = name;
        this.Instructor = Instructor;
        this.aprendices = aprendices;
        this.material = material;
        this.entregas = entregas;
        this.status = status
    }

    // Método para validar una instancia de usuario usando Zod
    static validate(cursoData) {
        return this.schema.safeParse(cursoData);
    }

    // Método para obtener los datos del usuario
    getCourseData() {
        return {
            name: this.name,
            Instructor: this.Instructor,
            aprendices: this.aprendices,
            material: this.material,
            entregas: this.entregas,
        };
    }
}

module.exports = Course;

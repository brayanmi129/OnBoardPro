const zod = require('zod');

class SeccionSchema {
    // Definir el esquema Zod para validar los datos de usuario
    static schema = zod.object({
        id: zod.string().min(1).max(50),
        IdCourse: zod.string().min(1).max(50),
        name: zod.string().min(1).max(50),
    });

    constructor({ id , IdCourse , name, }) {
        this.id = id;
        this.IdCourse = IdCourse;
        this.name = name;
    }
    getData() {
        return {...this};
    }
}

module.exports = SeccionSchema; // Exportar la clase para poder usarla en otros archivos
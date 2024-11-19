const zod = require('zod');

class Course {
    static schema = zod.object({
        id: zod.string().min(1).max(50),
        name: zod.string().min(1).max(50),
        instructor: zod.string().email(),
        grupo: zod.string().min(1).max(50).optional(),
        status: zod.enum(['En curso', 'Cerrado', 'Abierto']).default('Abierto'),
    });

    constructor({ id, name, instructor, grupo, status }) {
        this.id = id;
        this.name = name;
        this.instructor = instructor;
        this.grupo = grupo || 'Sin grupo';
        this.status = status || 'Abierto';
    }

    static create(data) {
        const validation = this.schema.safeParse(data);
        if (!validation.success) {
            throw new Error(validation.error);
        }
        return new Course(validation.data);
    }

    getCourseData() {
        return { ...this };
    }
}


module.exports = Course;

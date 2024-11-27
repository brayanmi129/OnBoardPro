const zod = require('zod');

class SchemaCourse{
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
    getData() {
        return { ...this };
    }
}

module.exports = SchemaCourse;
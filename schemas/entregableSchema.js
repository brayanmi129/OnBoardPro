const zod = require('zod');

class entregableSchema{

static schema = zod.object({
    id: zod.string().min(1).max(50),
    name: zod.string().min(1).max(50),
    id_seccion: zod.string().min(1).max(50).optional(),
    description: zod.string().min(1).max(400).optional(),
    adjunto: zod.string().url().optional(),
    comentario: zod.string().min(1).max(400).optional(),
});

constructor({ id, name, id_seccion, description, adjunto , comentario}) {
    this.id = id;
    this.name = name;
    this.id_seccion = id_seccion;
    this.description = description ;
    this.adjunto = adjunto;
    this.comentario = comentario;
}
getData() {
    return { ...this };
}

}

module.exports = entregableSchema; // Exportar la clase para poder usarla en otros archivos
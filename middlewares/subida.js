// Recepción de archivos subidos desde el navegador.
//
// Se guardan en memoria y no en disco porque de acá van directo a Supabase
// Storage: escribirlos en el disco de Render no serviría de nada, ese disco es
// efímero y se pierde en cada despliegue.
const multer = require("multer");

const MB = 1024 * 1024;

// Los límites se repiten en el bucket de Storage. Rechazar acá evita subir
// 50 MB para que recién después el bucket diga que no.
const IMAGENES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MATERIAL = [
  ...IMAGENES,
  "application/pdf",
  "video/mp4",
  "video/webm",
  "video/quicktime",
];

function soloTipos(permitidos) {
  return (req, file, cb) => {
    if (permitidos.includes(file.mimetype)) return cb(null, true);
    cb(new Error(`Tipo de archivo no permitido: ${file.mimetype}`));
  };
}

const subirBanner = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * MB, files: 1 },
  fileFilter: soloTipos(IMAGENES),
}).single("banner");

const subirMaterial = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * MB, files: 1 },
  fileFilter: soloTipos(MATERIAL),
}).single("archivo");

// La carga masiva de usuarios (HU-019). Se filtra por extensión y no por
// tipo MIME: el navegador manda un CSV como text/csv, application/vnd.ms-excel
// o application/octet-stream según el sistema, y los tres son el mismo archivo.
const subirPlanilla = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * MB, files: 1 },
  fileFilter: (req, file, cb) => {
    if (/\.(csv|xlsx)$/i.test(file.originalname || "")) return cb(null, true);
    cb(new Error("El archivo tiene que ser .csv o .xlsx."));
  },
}).single("archivo");

// multer devuelve sus errores por next(err). Sin esto caerían en el manejador
// genérico como un 500, cuando en realidad son culpa de lo que mandó el cliente.
function conManejo(middleware, mensajeTamano = "El archivo supera el tamaño máximo permitido.") {
  return (req, res, next) =>
    middleware(req, res, (err) => {
      if (!err) return next();
      const esLimite = err instanceof multer.MulterError;
      return res.status(400).json({
        message: esLimite && err.code === "LIMIT_FILE_SIZE" ? mensajeTamano : err.message,
      });
    });
}

module.exports = {
  banner: conManejo(subirBanner),
  material: conManejo(subirMaterial),
  planilla: conManejo(subirPlanilla, "El archivo supera el máximo de 2 MB."),
};

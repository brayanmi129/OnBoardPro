require("dotenv").config();
const express = require("express");
const session = require("express-session");
const passport = require("passport");
const cors = require("cors");
const path = require("path");
const { swaggerUi, swaggerSpec } = require("./config/swagger");

const app = express();
const port = process.env.PORT || 3000;

// Render y Azure terminan TLS en un proxy. Sin esto Express no reconoce la
// conexión como HTTPS y nunca emite la cookie de sesión marcada como secure,
// lo que rompe el parámetro state de OAuth.
app.set("trust proxy", 1);

// Passport strategies (una sola vez)
require("./helpers/passportHelper.js");

// La sesión solo existe para guardar el state de OAuth entre la ida a Google
// y la vuelta al callback. No se usa para mantener usuarios autenticados:
// de eso se encarga el JWT.
app.use(
  session({
    secret: process.env.SESSION_SECRET || "fallback-dev-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      sameSite: "lax", // el proveedor nos devuelve por navegación GET, lax la conserva
      maxAge: 1000 * 60 * 10,
    },
  })
);

app.use(passport.initialize());

// Orígenes del frontend autorizados a llamar a esta API.
// Solo se listan frontends: poner aquí la URL del propio backend no hace nada.
const origenesPermitidos = [
  "https://onboardpro.onrender.com",
  "https://on-board-pro-iqg3.vercel.app",
  "https://onboard-pro-refactor.vercel.app",
  process.env.URL_FRONT,
].filter(Boolean);

// En local no fijamos el puerto: cada quien levanta su front donde puede
// (Vite salta a 5174 si 5173 está ocupado, Angular usa 4200) y 127.0.0.1 es un
// origen distinto de localhost para el navegador. Una página maliciosa no puede
// presentarse con un Origin de localhost salvo que se sirva desde localhost.
const ES_LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

const opcionesCors = {
  origin(origin, cb) {
    // Sin Origin: curl, Postman o el navegador pidiendo el propio /index.html
    if (!origin) return cb(null, true);
    if (origenesPermitidos.includes(origin) || ES_LOCAL.test(origin)) return cb(null, true);
    cb(new Error(`Origen no autorizado por CORS: ${origin}`));
  },
  // El JWT viaja como Bearer, pero permitirlo evita que un front que manda
  // credentials: "include" falle con un error que no explica nada.
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  // Sin esto el navegador recibe las cabeceras pero no deja leerlas desde otro
  // origen: el front vería la lista paginada sin saber cuántas páginas hay.
  exposedHeaders: ["X-Total-Count", "X-Page", "X-Per-Page", "X-Total-Pages"],
};

// El preflight usa la MISMA configuración a propósito. Antes era cors() a secas,
// que acepta cualquier origen: el preflight daba 204 y solo fallaba la petición
// real, un síntoma imposible de diagnosticar.
app.use(cors(opcionesCors));
app.options("*", cors(opcionesCors));

// 100 KB (el valor por defecto) se queda corto para cuerpos legítimos como una
// lista larga de ids o una descripción extensa. 1 MB alcanza de sobra para
// cualquier JSON de esta API.
//
// No se sube más: los archivos NO viajan por acá. Van por multipart a los
// endpoints que usan multer, que aceptan hasta 50 MB y los mandan derecho a
// Storage sin cargarlos enteros en memoria como JSON. Permitir un JSON de 50 MB
// abriría esa puerta en todos los endpoints, incluso los que solo esperan dos
// campos.
app.use(express.json({ limit: "1mb" }));
app.use(express.static("public"));

// Routes
const userRoutes = require("./routes/userRoutes.js");
const authRoutes = require("./routes/authRoutes.js");
const courseRoutes = require("./routes/coursesRoutes.js");
const activitiesRoutes = require("./routes/activitiesRoutes.js");
const groupRoutes = require("./routes/groupsRoutes.js");
const gamificationRoutes = require("./routes/gamificationRoutes.js");
const tenantRoutes = require("./routes/tenantRoutes.js");
const sectionRoutes = require("./routes/sectionsRoutes.js");
const entregaRoutes = require("./routes/entregasRoutes.js");
const examenRoutes = require("./routes/examenesRoutes.js");
const logrosRoutes = require("./routes/logrosRoutes.js");

app.use("/api/users", userRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/courses", courseRoutes);
app.use("/api/activities", activitiesRoutes);
app.use("/api/groups", groupRoutes);
app.use("/api/gamification", gamificationRoutes);
// Comparte prefijo con el router de arriba: sus rutas cuelgan de /logros y no
// chocan con /me, /ranking ni /pendientes.
app.use("/api/gamification", logrosRoutes);
app.use("/api/tenants", tenantRoutes);

// Va al final y montado en /api porque sus rutas cruzan varios recursos
// (/courses/:id/sections, /sections/:id, /activities/:id/seccion). Si se
// montara antes, taparía rutas de los routers de arriba.
app.use("/api", sectionRoutes);
app.use("/api", entregaRoutes);
app.use("/api", examenRoutes);

app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// El enlace del correo apunta a /reset-password. Cuando URL_FRONT es este mismo
// backend (desarrollo y demo), hay que devolver el panel y no el texto de abajo.
app.get("/reset-password", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/*", (req, res) => {
  res.send("Welcome to OnBoardPro API");
});

// Un origen rechazado por CORS llega aca como error. Responder 403 con el
// origen concreto es lo que permite depurarlo desde el navegador.
app.use((err, req, res, next) => {
  if (err?.message?.startsWith("Origen no autorizado por CORS")) {
    console.warn(err.message);
    return res.status(403).json({ message: err.message });
  }

  // Cuerpo demasiado grande. Es culpa de lo que mandó el cliente, no un fallo
  // del servidor: salía como 500 y el mensaje no decía nada, así que depurarlo
  // obligaba a leer los logs de Render.
  if (err?.type === "entity.too.large" || err?.status === 413) {
    const mb = (err.limit / 1024 / 1024).toFixed(1);
    console.warn(
      `[cuerpo grande] ${req.method} ${req.originalUrl} · ${err.length} bytes, límite ${err.limit}`
    );
    return res.status(413).json({
      message:
        `El cuerpo de la petición supera el límite de ${mb} MB. ` +
        `Si estás subiendo un archivo, envialo como multipart/form-data ` +
        `(campo "archivo" o "banner"), no dentro del JSON.`,
    });
  }

  console.error(err);
  res.status(500).json({ message: "Error interno del servidor." });
});

app.listen(port, () => console.log(`Server ready on port ${port}.`));

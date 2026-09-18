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
};

// El preflight usa la MISMA configuración a propósito. Antes era cors() a secas,
// que acepta cualquier origen: el preflight daba 204 y solo fallaba la petición
// real, un síntoma imposible de diagnosticar.
app.use(cors(opcionesCors));
app.options("*", cors(opcionesCors));

app.use(express.json());
app.use(express.static("public"));

// Routes
const userRoutes = require("./routes/userRoutes.js");
const authRoutes = require("./routes/authRoutes.js");
const courseRoutes = require("./routes/coursesRoutes.js");
const activitiesRoutes = require("./routes/activitiesRoutes.js");
const groupRoutes = require("./routes/groupsRoutes.js");
const gamificationRoutes = require("./routes/gamificationRoutes.js");
const tenantRoutes = require("./routes/tenantRoutes.js");

app.use("/api/users", userRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/courses", courseRoutes);
app.use("/api/activities", activitiesRoutes);
app.use("/api/groups", groupRoutes);
app.use("/api/gamification", gamificationRoutes);
app.use("/api/tenants", tenantRoutes);

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
  console.error(err);
  res.status(500).json({ message: "Error interno del servidor." });
});

app.listen(port, () => console.log(`Server ready on port ${port}.`));

require("dotenv").config();
const express = require("express");
const session = require("express-session");
const passport = require("passport");
const cors = require("cors");
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
  "http://localhost:5173", // Vite en local
  "http://localhost:3000",
  "https://on-board-pro-iqg3.vercel.app",
  process.env.URL_FRONT,
].filter(Boolean);

app.use(
  cors({
    origin: [...new Set(origenesPermitidos)],
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.options("*", cors());

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

app.get("/*", (req, res) => {
  res.send("Welcome to OnBoardPro API");
});

app.listen(port, () => console.log(`Server ready on port ${port}.`));

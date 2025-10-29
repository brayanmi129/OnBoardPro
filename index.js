// express
const express = require("express");
const session = require("express-session");
const passport = require("passport");
const { swaggerUi, swaggerSpec } = require("./config/swagger");
require("dotenv").config();
const port = process.env.PORT || 3000;
const app = express();

//firebase
const { conectfirebase } = require("./helpers/firebaseHelper.js");
conectfirebase();

//passport strategies
require("./helpers/passportHelper.js");

//google
app.use(
  session({
    secret: "studify2024",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: false, // Si estás usando HTTP
      maxAge: 1000 * 60 * 60 * 24, // 1 día, por ejemplo
    },
  })
);

// Inicializar Passport y el middleware de sesión
app.use(passport.initialize());
app.use(passport.session());

//routes
const userRoutes = require("./routes/userRoutes.js");
const authRoutes = require("./routes/authRoutes.js");
const courseRoutes = require("./routes/coursesRoutes.js");
const activitiesRoutes = require("./routes/activitiesRoutes.js");

//middlewares para poder recibir datos json
app.use(express.json());

const cors = require("cors");

app.use(
  cors({
    origin: "*", // Cambia esto por el origen correcto
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
  })
);

app.use("/api/users", userRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/courses", courseRoutes);
app.use("/api/activities", activitiesRoutes);

// Documentación Swagger
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.get("/*", (req, res) => {
  res.send("Welcome to OnBoardPro API");
});

app.listen(port, () => console.log(`Server ready on port ${port}.`));

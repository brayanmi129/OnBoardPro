require("dotenv").config();
const express = require("express");
const session = require("express-session");
const passport = require("passport");
const cors = require("cors");
const { swaggerUi, swaggerSpec } = require("./config/swagger");

const app = express();
const port = process.env.PORT || 3000;

// Passport strategies (una sola vez)
require("./helpers/passportHelper.js");

app.use(
  session({
    secret: process.env.SESSION_SECRET || "fallback-dev-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      maxAge: 1000 * 60 * 60 * 24,
    },
  })
);

app.use(passport.initialize());
app.use(passport.session());
app.use(express.json());
app.use(express.static("public"));

app.use(
  cors({
    origin: [
      "http://localhost:3000",
      "https://on-board-pro-iqg3.vercel.app",
      "http://localhost:7777",
      "https://onboardpro-back.azurewebsites.net",
    ],
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.options("*", cors());

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

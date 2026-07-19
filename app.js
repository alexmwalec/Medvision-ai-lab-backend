import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { initDatabase } from "./src/config/database.js";
import routes from "./src/routes/index.js";
import { errorHandler } from "./src/middleware/auth.js";
import { uptime } from "process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8000;
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || "http://localhost:3000";

app.use(cors({ 
  origin: FRONTEND_ORIGIN,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true
}));
// Middleware
app.disable("x-powered-by");
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.use((req, res, next) => {
  console.log(` ${req.method} ${req.url}`);
  next();
});

// Health check
app.get("/health", (req, res) => {
  res.json({
     status: "ok",
     timestamp: new Date().toISOString(),
     uptime: process.uptime()
  });
});

import routes from "./src/routes/index.js"
app.use("/api", routes);


app.use((req, res) => {
  console.log(`404 - Route not found: ${req.method} ${req.url}`);
  res.status(404).json({ 
    error: "Route not found",
    path: req.url,
    method: req.method
  });
});

// Error handler
app.use(errorHandler);

const start = async () => {
  try {
    await initDatabase();
    console.log("Database connected");
    
    app.listen(PORT, () => {
      console.log(` Server running on http://localhost:${PORT}`);
      console.log(` CORS enabled for: ${FRONTEND_ORIGIN}`);
    });
  } catch (error) {
    console.error("Failed to start:", error.message);
    process.exit(1);
  }
};

start();
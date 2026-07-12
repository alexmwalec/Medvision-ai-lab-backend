import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { pool, initDatabase, dbReady } from "./src/config/database.js";
import { securityHeaders } from "./src/middleware/security.js";
import { rateLimit } from "./src/middleware/rateLimiter.js";
import { requireDatabase } from "./src/middleware/auth.js";
import routes from "./src/routes/index.js";
import fs from "fs/promises";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT || 8000);
const NODE_ENV = process.env.NODE_ENV || "development";
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || "http://localhost:3000";
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, "uploads");

// Middleware
app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(securityHeaders);
app.use(cors({
  origin: FRONTEND_ORIGIN.split(","),
  methods: ["GET", "POST", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  maxAge: 86400
}));
app.use(express.json({ limit: "1mb" }));
app.use(rateLimit({ windowMs: 60 * 1000, max: Number(process.env.RATE_LIMIT_PER_MINUTE || 120) }));
app.use("/uploads", express.static(UPLOAD_DIR, {
  fallthrough: false,
  maxAge: NODE_ENV === "production" ? "1h" : 0
}));

// Routes
app.use("/", routes);

// Error handling
app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

app.use((error, req, res, next) => {
  const status = error.message?.includes("CORS") ? 403 : 500;
  console.error(error);
  return res.status(status).json({
    error: status === 500 ? "Internal server error" : error.message,
    ...(NODE_ENV !== "production" && status === 500 ? { detail: error.message } : {})
  });
});

// Start server
const start = async () => {
  await fs.mkdir(UPLOAD_DIR, { recursive: true });

  try {
    await initDatabase();
    console.log("MySQL schema is ready.");
  } catch (error) {
    console.error("MySQL initialization failed:", error.message);
  }

  app.listen(PORT, () => {
    console.log(` Backend API running at http://localhost:${PORT}`);
    console.log(` Allowed frontend origin(s): ${FRONTEND_ORIGIN}`);
  });
};

start();
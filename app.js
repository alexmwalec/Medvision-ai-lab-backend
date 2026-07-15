import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { initDatabase } from "./src/config/database.js";
import routes from "./src/routes/index.js";
import { errorHandler } from "./src/middleware/auth.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 8000;
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || "http://localhost:3000";

// Middleware
app.disable("x-powered-by");
app.use(cors({ origin: FRONTEND_ORIGIN }));
app.use(express.json({ limit: "10mb" }));

// Static files
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Routes
app.use("/api", routes);

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Error handler
app.use(errorHandler);

// Start server
const start = async () => {
  try {
    await initDatabase();
    console.log("Database connected");
    
    app.listen(PORT, () => {
      console.log(` Server running on http://localhost:${PORT}`);
      console.log(` API available at http://localhost:${PORT}/api`);
    });
  } catch (error) {
    console.error(" Failed to start:", error.message);
    process.exit(1);
  }
};

start();
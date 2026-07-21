import express from "express";
import { upload } from "../middleware/upload.js";
import { analyzeCxr, getPatients, getPatient } from "../controllers/analysisController.js";

const router = express.Router();

router.get("/", (req, res) => {
  res.json({
    name: "MedVision API",
    version: "2.0.0",
    endpoints: [
      { method: "GET", path: "/api", description: "API info" },
      { method: "POST", path: "/api/analyze", description: "Upload and analyze X-ray" },
      { method: "GET", path: "/api/patients", description: "Get all patients" },
      { method: "GET", path: "/api/patients/:id", description: "Get patient by ID" },
    ]
  });
});

// Analysis endpoint
router.post("/analyze", upload.single("image"), analyzeCxr);

// Patient endpoints
router.get("/patients", getPatients);
router.get("/patients/:id", getPatient);

// Test endpoint
router.get("/test", (req, res) => {
  res.json({ 
    message: "API is working!", 
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV
  });
});

export default router;
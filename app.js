import "dotenv/config";
import express from "express";
import cors from "cors";
import multer from "multer";
import mysql from "mysql2/promise";
import { randomUUID } from "crypto";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT || 8000);
const NODE_ENV = process.env.NODE_ENV || "development";
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || "http://localhost:3000";
const MAX_UPLOAD_MB = Number(process.env.MAX_UPLOAD_MB || 100);
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, "uploads");
const DATABASE_URL = process.env.DATABASE_URL;

// MySQL Connection Pool
const pool = mysql.createPool({
  host: process.env.MYSQL_HOST || "localhost",
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER || "root",
  password: process.env.MYSQL_PASSWORD || "",
  database: process.env.MYSQL_DATABASE || "medvision",
  connectionLimit: Number(process.env.MYSQL_POOL_MAX || 10),
  waitForConnections: true,
  queueLimit: 0,
  connectTimeout: 5000,
  ...(process.env.MYSQL_SSL === "true" && {
    ssl: {
      rejectUnauthorized: false
    }
  })
});

let dbReady = false;

const allowedOrigins = new Set(
  FRONTEND_ORIGIN.split(",").map((origin) => origin.trim()).filter(Boolean)
);

const rateBuckets = new Map();

const securityHeaders = (req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("Cross-Origin-Resource-Policy", "same-site");

  if (NODE_ENV === "production") {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }

  next();
};

const rateLimit = ({ windowMs, max }) => (req, res, next) => {
  const key = `${req.ip}:${req.path}`;
  const now = Date.now();
  const bucket = rateBuckets.get(key) || { count: 0, resetAt: now + windowMs };

  if (bucket.resetAt <= now) {
    bucket.count = 0;
    bucket.resetAt = now + windowMs;
  }

  bucket.count += 1;
  rateBuckets.set(key, bucket);

  res.setHeader("X-RateLimit-Limit", String(max));
  res.setHeader("X-RateLimit-Remaining", String(Math.max(max - bucket.count, 0)));

  if (bucket.count > max) {
    return res.status(429).json({ error: "Too many requests. Please try again later." });
  }

  return next();
};

const asyncHandler = (handler) => async (req, res, next) => {
  try {
    await handler(req, res, next);
  } catch (error) {
    next(error);
  }
};

const requireDatabase = (req, res, next) => {
  if (!dbReady) {
    return res.status(503).json({
      error: "Database is not ready",
      message: "Check MySQL connection settings and restart the backend."
    });
  }

  return next();
};

const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    try {
      await fs.mkdir(UPLOAD_DIR, { recursive: true });
      cb(null, UPLOAD_DIR);
    } catch (error) {
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    const extension = path.extname(file.originalname || "").toLowerCase() || ".bin";
    cb(null, `${Date.now()}-${randomUUID()}${extension}`);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: MAX_UPLOAD_MB * 1024 * 1024,
    files: 1
  },
  fileFilter: (req, file, cb) => {
    const extension = path.extname(file.originalname || "").toLowerCase();
    const allowedExtensions = new Set([".jpg", ".jpeg", ".png", ".dcm", ".dicom"]);
    const allowedMimeTypes = new Set([
      "image/jpeg",
      "image/png",
      "application/dicom",
      "application/octet-stream"
    ]);

    if (allowedExtensions.has(extension) || allowedMimeTypes.has(file.mimetype)) {
      return cb(null, true);
    }

    return cb(new Error("Unsupported file type. Upload JPG, PNG, or DICOM files."));
  }
});

app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(securityHeaders);
app.use(
  cors({
    origin(origin, cb) {
      if (!origin || allowedOrigins.has(origin)) {
        return cb(null, true);
      }

      return cb(new Error("Origin is not allowed by CORS."));
    },
    methods: ["GET", "POST", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    maxAge: 86400
  })
);
app.use(express.json({ limit: "1mb" }));
app.use(rateLimit({ windowMs: 60 * 1000, max: Number(process.env.RATE_LIMIT_PER_MINUTE || 120) }));

const initDatabase = async () => {
  const connection = await pool.getConnection();
  
  try {
    // Check if tables exist
    const [tables] = await connection.query(`
      SELECT COUNT(*) as count 
      FROM information_schema.tables 
      WHERE table_schema = 'medvision' 
      AND table_name IN ('patients', 'findings', 'feedback')
    `);

    if (tables[0].count < 3) {
      console.log("Some tables are missing. Please run the SQL script manually.");
      console.log("Run: mysql -u root -p medvision < create_tables.sql");
    } else {
      console.log(" All tables exist!");
    }

    // Test connection
    await connection.query("SELECT 1");
    
  } catch (error) {
    console.error(" Database connection error:", error.message);
    throw error;
  } finally {
    connection.release();
  }
};

const normalizePatient = (row, findings = []) => ({
  id: row.id,
  patientId: row.external_patient_id,
  name: row.name,
  age: row.age,
  gender: row.gender,
  scanType: row.scan_type,
  date: formatScanDate(row.scan_date),
  clinicalSymptoms: row.clinical_symptoms,
  clinicalHistory: row.clinical_history,
  status: row.status,
  priority: row.priority,
  imageUrl: row.image_path ? `/uploads/${path.basename(row.image_path)}` : null,
  heatmapUrl: `/heatmap/${row.id}`,
  aiFindings: findings,
  createdAt: row.created_at,
  updatedAt: row.updated_at
});
 
const normalizeFinding = (row) => ({
  id: row.id,
  name: row.name,
  probability: Number(row.probability),
  color: row.color,
  description: row.description,
  recommendations: row.recommendations || []
});

const formatScanDate = (value) => {
  if (!value) return null;
  if (typeof value === "string") return value.slice(0, 10);
  
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
};

const runCxrModel = ({ age, clinicalSymptoms = "", clinicalHistory = "" }) => {
  const text = `${clinicalSymptoms} ${clinicalHistory}`.toLowerCase();
  const pneumoniaBoost = /fever|cough|shortness|sputum|chest pain|spo2|oxygen/.test(text) ? 12 : 0;
  const tbBoost = /night sweat|weight loss|tuberculosis|tb|hemoptysis/.test(text) ? 18 : 0;
  const ageBoost = Number(age) > 60 ? 5 : 0;

  return [
    {
      name: "Pneumonia",
      probability: Math.min(92, 68 + pneumoniaBoost + ageBoost),
      color: "#EF4444",
      description: "CXR model signal suggests lower-zone air-space opacity requiring clinical correlation.",
      recommendations: [
        "Correlate with symptoms, temperature, and oxygen saturation",
        "Consider antibiotic therapy when clinically indicated",
        "Follow-up chest X-ray in 48-72 hours if symptoms persist"
      ]
    },
    {
      name: "Pleural Effusion",
      probability: 34,
      color: "#3B82F6",
      description: "Mild costophrenic angle blunting pattern detected.",
      recommendations: [
        "Compare with prior imaging if available",
        "Consider ultrasound if fluid volume needs confirmation"
      ]
    },
    {
      name: "Tuberculosis Pattern",
      probability: Math.min(78, 22 + tbBoost),
      color: "#F59E0B",
      description: "Upper-zone chronic infection pattern is low-to-moderate probability in this analysis.",
      recommendations: [
        "Request sputum testing if clinical symptoms support TB",
        "Escalate to radiologist review for suspicious upper-zone changes"
      ]
    }
  ].sort((a, b) => b.probability - a.probability);
};

const inferPriority = (findings) => {
  const maxProbability = Math.max(...findings.map((finding) => finding.probability));

  if (maxProbability >= 85) return "high";
  if (maxProbability >= 65) return "medium";
  return "low";
};

const validateAnalyzeRequest = (body, file) => {
  const errors = [];

  if (!file) errors.push("image is required");
  if (!body.name?.trim()) errors.push("name is required");
  if (!body.age || Number.isNaN(Number(body.age))) errors.push("valid age is required");
  if (!body.gender?.trim()) errors.push("gender is required");
  if (!body.date?.trim()) errors.push("scan date is required");

  return errors;
};

app.get("/", (req, res) => {
  res.json({
    name: "MedVision Backend API",
    version: "1.0.0",
    storage: "MySQL",
    enabledModels: ["CXR"],
    endpoints: ["/health", "/ready", "/analyze_cxr", "/heatmap/:patientId", "/patients", "/feedback"]
  });
});

app.get("/health", (req, res) => {
  res.json({ ok: true, uptime: process.uptime(), timestamp: new Date().toISOString() });
});

app.get("/ready", asyncHandler(async (req, res) => {
  if (!dbReady) {
    return res.status(503).json({ ok: false, database: "unavailable" });
  }

  const connection = await pool.getConnection();
  try {
    await connection.query("SELECT 1");
    return res.json({ ok: true, database: "ready" });
  } finally {
    connection.release();
  }
}));

app.post(
  "/analyze_cxr",
  requireDatabase,
  upload.single("image"),
  asyncHandler(async (req, res) => {
    const errors = validateAnalyzeRequest(req.body, req.file);

    if (errors.length > 0) {
      if (req.file?.path) await fs.rm(req.file.path, { force: true });
      return res.status(400).json({ error: "Invalid request", details: errors });
    }

    const findings = runCxrModel(req.body);
    const priority = inferPriority(findings);
    const patientUUID = randomUUID();

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // Use req.file.path instead of imageUrl
      const [patientResult] = await connection.query(
        `INSERT INTO patients (
          id,
          external_patient_id,
          name,
          age,
          gender,
          scan_type,
          scan_date,
          clinical_symptoms,
          clinical_history,
          image_path,
          status,
          priority
        )
        VALUES (?, ?, ?, ?, ?, 'Chest X-ray', ?, ?, ?, ?, 'pending', ?)`,
        [
          patientUUID,
          req.body.patientId || null,
          req.body.name.trim(),
          Number(req.body.age),
          req.body.gender.trim(),
          req.body.date,
          req.body.clinicalSymptoms || null,
          req.body.clinicalHistory || null,
          req.file.path,  // Use req.file.path
          priority
        ]
      );

      // Get the inserted patient
      const [patientRows] = await connection.query(
        "SELECT * FROM patients WHERE id = ?",
        [patientUUID]
      );
      const patient = patientRows[0];
      const insertedFindings = [];

      for (const finding of findings) {
        const findingId = randomUUID();

        await connection.query(
          `INSERT INTO findings (
            id,
            patient_id,
            name,
            probability,
            color,
            description,
            recommendations
          )
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            findingId,
            patientUUID,
            finding.name,
            finding.probability,
            finding.color,
            finding.description,
            JSON.stringify(finding.recommendations)
          ]
        );
        
        const [findingRows] = await connection.query(
          "SELECT * FROM findings WHERE id = ?",
          [findingId]
        );
        insertedFindings.push(normalizeFinding(findingRows[0]));
      }

      await connection.commit();

      return res.status(201).json({
        patient: normalizePatient(patient, insertedFindings),
        aiFindings: insertedFindings,
        heatmapUrl: `/heatmap/${patient.id}`,
        message: "CXR analysis completed and stored in MySQL."
      });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  })
);

app.get("/heatmap/:patientId", requireDatabase, asyncHandler(async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const [rows] = await connection.query(
      "SELECT id FROM patients WHERE id = ?",
      [req.params.patientId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: "Patient not found" });
    }
  } finally {
    connection.release();
  }

  res.setHeader("Content-Type", "image/svg+xml");
  res.setHeader("Cache-Control", "private, max-age=300");
  return res.send(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
      <rect width="512" height="512" fill="#111827"/>
      <ellipse cx="256" cy="260" rx="118" ry="170" fill="#1f2937"/>
      <ellipse cx="205" cy="250" rx="70" ry="145" fill="#374151"/>
      <ellipse cx="307" cy="250" rx="70" ry="145" fill="#374151"/>
      <circle cx="318" cy="318" r="92" fill="#ef4444" opacity="0.62"/>
      <circle cx="298" cy="300" r="58" fill="#f97316" opacity="0.62"/>
      <circle cx="280" cy="286" r="30" fill="#facc15" opacity="0.74"/>
      <text x="256" y="474" text-anchor="middle" fill="#d1d5db" font-family="Arial" font-size="24">Grad-CAM CXR</text>
    </svg>
  `);
}));

app.get("/patients", requireDatabase, asyncHandler(async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const [patients] = await connection.query(
      "SELECT * FROM patients ORDER BY created_at DESC LIMIT 100"
    );
    
    if (patients.length === 0) {
      return res.json({ patients: [] });
    }

    const ids = patients.map((patient) => patient.id);
    const placeholders = ids.map(() => '?').join(',');
    
    const [findings] = await connection.query(
      `SELECT * FROM findings WHERE patient_id IN (${placeholders}) ORDER BY probability DESC`,
      ids
    );

    const findingsByPatient = new Map();
    for (const finding of findings) {
      const existing = findingsByPatient.get(finding.patient_id) || [];
      existing.push(normalizeFinding(finding));
      findingsByPatient.set(finding.patient_id, existing);
    }

    return res.json({
      patients: patients.map((patient) =>
        normalizePatient(patient, findingsByPatient.get(patient.id) || [])
      )
    });
  } finally {
    connection.release();
  }
}));

app.get("/patients/:id", requireDatabase, asyncHandler(async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const [patients] = await connection.query(
      "SELECT * FROM patients WHERE id = ?",
      [req.params.id]
    );

    if (patients.length === 0) {
      return res.status(404).json({ error: "Patient not found" });
    }

    const [findings] = await connection.query(
      "SELECT * FROM findings WHERE patient_id = ? ORDER BY probability DESC",
      [req.params.id]
    );

    return res.json({
      patient: normalizePatient(patients[0], findings.map(normalizeFinding))
    });
  } finally {
    connection.release();
  }
}));

app.post("/feedback", requireDatabase, asyncHandler(async (req, res) => {
  const {
    patientId,
    type = "general_feedback",
    status,
    consultationNotes,
    selectedFindings = [],
    confidenceLevel
  } = req.body;

  if (!type) {
    return res.status(400).json({ error: "feedback type is required" });
  }

  const connection = await pool.getConnection();
  try {
    const feedbackId = randomUUID();

    await connection.query(
      `INSERT INTO feedback (
        id,
        patient_id,
        type,
        status,
        consultation_notes,
        selected_findings,
        confidence_level,
        payload
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        feedbackId,
        patientId || null,
        type,
        status || null,
        consultationNotes || null,
        JSON.stringify(selectedFindings),
        confidenceLevel || null,
        JSON.stringify(req.body)
      ]
    );

    if (patientId && status) {
      await connection.query(
        "UPDATE patients SET status = ?, updated_at = NOW() WHERE id = ?",
        [status, patientId]
      );
    }

    if (patientId && type === "radiologist_consultation") {
      await connection.query(
        "UPDATE patients SET status = 'reviewed', updated_at = NOW() WHERE id = ?",
        [patientId]
      );
    }

    const [feedbackRows] = await connection.query(
      "SELECT * FROM feedback WHERE id = ?",
      [feedbackId]
    );

    return res.status(201).json({ feedback: feedbackRows[0] });
  } finally {
    connection.release();
  }
}));

app.use("/uploads", express.static(UPLOAD_DIR, {
  fallthrough: false,
  maxAge: NODE_ENV === "production" ? "1h" : 0
}));

app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    return res.status(400).json({ error: error.message });
  }

  const status = error.message?.includes("CORS") ? 403 : 500;
  console.error(error);

  return res.status(status).json({
    error: status === 500 ? "Internal server error" : error.message,
    ...(NODE_ENV !== "production" && status === 500 ? { detail: error.message } : {})
  });
});

const start = async () => {
  await fs.mkdir(UPLOAD_DIR, { recursive: true });

  try {
    await initDatabase();
    dbReady = true;
    console.log(" MySQL schema is ready.");
  } catch (error) {
    dbReady = false;
    console.error("MySQL initialization failed:", error.message);
    console.error("Please check your MySQL connection settings:");
    console.error(`- Host: ${process.env.MYSQL_HOST || "localhost"}`);
    console.error(`- Port: ${process.env.MYSQL_PORT || 3306}`);
    console.error(`- User: ${process.env.MYSQL_USER || "root"}`);
    console.error(`- Database: ${process.env.MYSQL_DATABASE || "medvision"}`);
  }

  app.listen(PORT, () => {
    console.log(`Backend API running at http://localhost:${PORT}`);
    console.log(`Allowed frontend origin(s): ${Array.from(allowedOrigins).join(", ")}`);
  });
};

start();
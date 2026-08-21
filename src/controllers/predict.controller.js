const fs = require("fs/promises");
const path = require("path");

const inferenceClient = require("../services/inferenceClient");
const patientsRepository = require("../db/patientsRepository");
const findingsRepository = require("../db/findingsRepository");
const { scoreToColor } = require("../utils/severity");

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, "..", "..", "uploads");
// Only create findings rows for diseases scoring at or above this —
// avoids cluttering the table with 14 near-zero rows per scan.
const FINDING_DISPLAY_THRESHOLD = parseFloat(process.env.FINDING_DISPLAY_THRESHOLD) || 0.15;

async function ensureUploadDirs(patientId) {
  const dir = path.join(UPLOAD_DIR, "patients", patientId);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

function priorityFromTopScore(topScore) {
  if (topScore >= 0.7) return "high";
  if (topScore >= 0.4) return "medium";
  return "low";
}

async function handlePredict(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: "No image uploaded. Expected multipart field named 'xray'.",
      });
    }

    const threshold = parseFloat(req.query.threshold) || 0.5;
    const explainTopN = parseInt(req.query.explain_top_n, 10) || 1;

    // --- Step 1: create the patient/scan record first, so we have an id ---
    // to use for file paths.
    const patientId = await patientsRepository.createPatientScan({
      externalPatientId: req.body.externalPatientId || null,
      name: req.body.patientName || "Unknown",
      age: req.body.age || null,
      gender: req.body.gender || null,
      scanType: req.body.scanType || "Chest X-ray",
      scanDate: req.body.scanDate || null,
      clinicalSymptoms: req.body.clinicalSymptoms || null,
      clinicalHistory: req.body.clinicalHistory || null,
    });

    const patientDir = await ensureUploadDirs(patientId);

    // --- Step 2: save the original uploaded image to disk ---
    const originalFilename = `original${path.extname(req.file.originalname) || ".png"}`;
    const imagePath = path.join(patientDir, originalFilename);
    await fs.writeFile(imagePath, req.file.buffer);

    // --- Step 3: call the inference service ---
    let result;
    try {
      result = await inferenceClient.predict(
        req.file.buffer,
        req.file.originalname,
        req.file.mimetype,
        { threshold, explainTopN }
      );
    } catch (err) {
      console.error("Inference service call failed:", err.message);
      return res.status(502).json({
        success: false,
        error: "Inference service unavailable or failed",
        detail: err.message,
      });
    }

    const { findings, explanations } = result;
    const topFinding = findings[0]; // findings is sorted by score desc, per app.py

    // --- Step 4: save the top finding's heatmap to disk (matches the ---
    // single heatmap_path column on patients — if you want a heatmap per
    // finding instead, store paths in a column on `findings` instead).
    let heatmapPath = null;
    const topExplanation = explanations.find((e) => e.disease === topFinding.disease);
    if (topExplanation) {
      const heatmapFilename = "heatmap.png";
      const heatmapFullPath = path.join(patientDir, heatmapFilename);
      await fs.writeFile(heatmapFullPath, Buffer.from(topExplanation.heatmap_png_base64, "base64"));
      heatmapPath = heatmapFullPath;
    }

    await patientsRepository.updateAfterInference(patientId, {
      heatmapPath,
      priority: priorityFromTopScore(topFinding.score),
    });

    // --- Step 5: insert one findings row per disease above display threshold ---
    const findingsToInsert = findings
      .filter((f) => f.score >= FINDING_DISPLAY_THRESHOLD)
      .map((f) => {
        const explanation = explanations.find((e) => e.disease === f.disease);
        return {
          name: f.disease,
          probability: Math.round(f.score * 100 * 100) / 100, // 0-100, 2 decimal places
          color: scoreToColor(f.score),
          description: null, // fill in with your clinical description lookup, if you have one
          recommendations: null, // fill in with your recommendation lookup, if you have one
          boundingBox: explanation ? explanation.bounding_box : null,
        };
      });

    await findingsRepository.insertFindings(patientId, findingsToInsert);

    return res.json({
      success: true,
      patientId,
      imagePath,
      heatmapPath,
      findings,
      explanations,
    });
  } catch (err) {
    console.error("Unexpected error in handlePredict:", err);
    return res.status(500).json({ success: false, error: "Internal server error" });
  }
}

module.exports = { handlePredict };
import { randomUUID } from "crypto";
import { query } from "../config/database.js";
import { analyzeWithAI } from "../services/aiService.js";
import { processImage } from "../services/visionService.js";
import fs from "fs/promises";
import path from "path";

export const analyzeCxr = async (req, res) => {
  try {
    console.log("Received analyze request");
    
    // Validate file
    if (!req.file) {
      return res.status(400).json({ error: "Image required" });
    }

    const { name, age, gender, date, clinicalSymptoms, clinicalHistory } = req.body;
    
    // Validate required fields
    if (!name || !age || !gender || !date) {
      await fs.rm(req.file.path, { force: true });
      return res.status(400).json({ 
        error: "Missing required fields",
        required: ["name", "age", "gender", "date"]
      });
    }

    console.log("Running computer vision analysis...");
    
    //  Process image with Computer Vision
    let visionResults = null;
    try {
      const imageBuffer = await fs.readFile(req.file.path);
      visionResults = await processImage(req.file.path);
      console.log("Vision analysis complete");
    } catch (visionError) {
      console.warn("Vision analysis failed, continuing with AI only:", visionError.message);
    }

    // 2. Calling Python AI service (CheXNet-14)
    console.log("🤖 Running AI analysis...");
    const aiResult = await analyzeWithAI({
      age,
      gender,
      clinicalSymptoms: clinicalSymptoms || "",
      clinicalHistory: clinicalHistory || "",
    });

    let combinedFindings = [];
    
    // Add vision findings
    if (visionResults && visionResults.abnormalities) {
      for (const ab of visionResults.abnormalities) {
        combinedFindings.push({
          name: ab.condition,
          probability: Math.round(ab.confidence * 100),
          color: getColor(ab.condition),
          description: getDescription(ab.condition),
          recommendations: getRecommendations(ab.condition),
          source: "computer-vision",
          boundingBox: {
            x: ab.bbox[0],
            y: ab.bbox[1],
            width: ab.bbox[2],
            height: ab.bbox[3],
            color: getColor(ab.condition)
          }
        });
      }
    }
    
    
    for (const finding of aiResult.findings || []) {
      if (!combinedFindings.some(f => f.name === finding.name)) {
        combinedFindings.push({
          ...finding,
          source: "ai-model"
        });
      }
    }
    
    // Sort by probability
    combinedFindings.sort((a, b) => b.probability - a.probability);

    // 4. Save to database
    const patientId = randomUUID();
    
    await query(
      `INSERT INTO patients (id, name, age, gender, scan_date, clinical_symptoms, clinical_history, image_path, priority)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        patientId, 
        name, 
        parseInt(age), 
        gender, 
        date, 
        clinicalSymptoms || null, 
        clinicalHistory || null, 
        req.file.path, 
        aiResult.priority || "medium"
      ]
    );

    // Save findings
    const findings = [];
    for (const finding of combinedFindings) {
      const findingId = randomUUID();
      await query(
        `INSERT INTO findings (id, patient_id, name, probability, color, description, recommendations, bounding_box)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          findingId, 
          patientId, 
          finding.name, 
          finding.probability, 
          finding.color, 
          finding.description, 
          JSON.stringify(finding.recommendations || []), 
          JSON.stringify(finding.boundingBox || {})
        ]
      );
      findings.push({ ...finding, id: findingId });
    }

    // 5. Return response
    res.status(201).json({
      success: true,
      patientId,
      findings,
      priority: aiResult.priority || "medium",
      totalDetected: findings.length,
      visionEnabled: !!visionResults,
      message: "Analysis complete"
    });

  } catch (error) {
    console.error("Analysis error:", error);
    if (req.file?.path) {
      await fs.rm(req.file.path, { force: true });
    }
    res.status(500).json({ 
      error: error.message || "Internal server error",
      stack: process.env.NODE_ENV === "development" ? error.stack : undefined
    });
  }
};

// Helper functions
function getColor(condition) {
  const colors = {
    "Pneumonia": "#00B894",
    "Pleural Effusion": "#00CEC9",
    "Tuberculosis Pattern": "#FDCB6E",
    "Nodule": "#E17055",
    "Cardiomegaly": "#FF4757",
    "Atelectasis": "#FF6B6B",
    "Consolidation": "#FF6B81",
    "Edema": "#FF9F43",
    "Emphysema": "#FECA57",
    "Fibrosis": "#A29BFE"
  };
  return colors[condition] || "#6B7280";
}

function getDescription(condition) {
  const descriptions = {
    "Pneumonia": "Lower-zone air-space opacity requiring clinical correlation.",
    "Pleural Effusion": "Fluid collection in pleural space. Blunting of costophrenic angle.",
    "Tuberculosis Pattern": "Upper-zone chronic infection pattern.",
    "Nodule": "Small round opacity < 3cm. Requires surveillance.",
    "Cardiomegaly": "Enlargement of the heart. Cardiothoracic ratio > 0.5."
  };
  return descriptions[condition] || "Abnormality detected in lung region.";
}

function getRecommendations(condition) {
  const recommendations = {
    "Pneumonia": ["Correlate with symptoms", "Consider antibiotic therapy"],
    "Pleural Effusion": ["Ultrasound for volume assessment", "Diuretic therapy"],
    "Tuberculosis Pattern": ["Sputum testing", "Infectious disease consultation"],
    "Nodule": ["CT follow-up", "Monitor for growth"],
    "Cardiomegaly": ["Echocardiogram", "Monitor blood pressure"]
  };
  return recommendations[condition] || ["Clinical correlation needed"];
}

export const getPatients = async (req, res) => {
  try {
    const patients = await query("SELECT * FROM patients ORDER BY created_at DESC");
    res.json({ success: true, patients });
  } catch (error) {
    console.error("Error fetching patients:", error);
    res.status(500).json({ error: error.message });
  }
};

export const getPatient = async (req, res) => {
  try {
    const { id } = req.params;
    const patients = await query("SELECT * FROM patients WHERE id = ?", [id]);
    if (patients.length === 0) {
      return res.status(404).json({ error: "Patient not found" });
    }
    const findings = await query("SELECT * FROM findings WHERE patient_id = ?", [id]);
    res.json({ success: true, patient: patients[0], findings });
  } catch (error) {
    console.error("Error fetching patient:", error);
    res.status(500).json({ error: error.message });
  }
};
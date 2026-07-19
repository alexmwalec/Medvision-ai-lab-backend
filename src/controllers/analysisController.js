import { randomUUID } from "crypto";
import { query } from "../config/database.js";
import { analyzeWithAI } from "../services/aiService.js";
import fs from "fs/promises";

export const analyzeCxr = async (req, res) => {
  try {
    console.log("Received analyze request");
    console.log("File:", req.file ? req.file.originalname : "No file");
    console.log("Body:", req.body);

    // Validate file exists
    if (!req.file) {
      return res.status(400).json({ error: "Image required" });
    }

    // Validate required fields
    const { name, age, gender, date } = req.body;
    if (!name || !age || !gender || !date) {
      await fs.rm(req.file.path, { force: true });
      return res.status(400).json({ 
        error: "Missing required fields",
        required: ["name", "age", "gender", "date"]
      });
    }

    // Call Python AI service
    console.log("Calling AI service...");
    const aiResult = await analyzeWithAI({
      age,
      gender,
      clinicalSymptoms: req.body.clinicalSymptoms || "",
      clinicalHistory: req.body.clinicalHistory || "",
    });

    console.log(" AI result:", aiResult);

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
        req.body.clinicalSymptoms || null, 
        req.body.clinicalHistory || null, 
        req.file.path, 
        aiResult.priority || "medium"
      ]
    );

    // Insert findings
    const findings = [];
    for (const finding of aiResult.findings || []) {
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

    // Return success
    res.status(201).json({
      success: true,
      patientId,
      findings,
      priority: aiResult.priority || "medium",
      totalDetected: findings.length,
      message: "Analysis complete"
    });

  } catch (error) {
    console.error(" Analysis error:", error);
    if (req.file?.path) {
      await fs.rm(req.file.path, { force: true });
    }
    res.status(500).json({ 
      error: error.message || "Internal server error",
      stack: process.env.NODE_ENV === "development" ? error.stack : undefined
    });
  }
};

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
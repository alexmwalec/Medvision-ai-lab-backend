import { randomUUID } from "crypto";
import { query } from "../config/database.js";
import { analyzeWithAI } from "../services/aiService.js";
import fs from "fs/promises";

export const analyzeCxr = async (req, res) => {
  try {
    // Validate
    if (!req.file) {
      return res.status(400).json({ error: "Image required" });
    }

    const { name, age, gender, date, clinicalSymptoms, clinicalHistory } = req.body;
    if (!name || !age || !gender || !date) {
      await fs.rm(req.file.path, { force: true });
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Call Python AI
    const aiResult = await analyzeWithAI({
      age,
      gender,
      clinicalSymptoms: clinicalSymptoms || "",
      clinicalHistory: clinicalHistory || "",
    });

    // Save to database
    const patientId = randomUUID();
    await query(
      `INSERT INTO patients (id, name, age, gender, scan_date, clinical_symptoms, clinical_history, image_path, priority)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [patientId, name, age, gender, date, clinicalSymptoms || null, clinicalHistory || null, req.file.path, aiResult.priority]
    );

    const findings = [];
    for (const finding of aiResult.findings) {
      const findingId = randomUUID();
      await query(
        `INSERT INTO findings (id, patient_id, name, probability, color, description, recommendations, bounding_box)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [findingId, patientId, finding.name, finding.probability, finding.color, finding.description, JSON.stringify(finding.recommendations), JSON.stringify(finding.boundingBox)]
      );
      findings.push({ ...finding, id: findingId });
    }

    res.status(201).json({
      patientId,
      findings,
      priority: aiResult.priority,
      message: "Analysis complete",
    });
  } catch (error) {
    if (req.file?.path) await fs.rm(req.file.path, { force: true });
    throw error;
  }
};

export const getPatients = async (req, res) => {
  const [patients] = await query("SELECT * FROM patients ORDER BY created_at DESC");
  res.json({ patients });
};

export const getPatient = async (req, res) => {
  const [patients] = await query("SELECT * FROM patients WHERE id = ?", [req.params.id]);
  if (patients.length === 0) {
    return res.status(404).json({ error: "Patient not found" });
  }

  const [findings] = await query("SELECT * FROM findings WHERE patient_id = ?", [req.params.id]);
  res.json({ patient: patients[0], findings });
}; 
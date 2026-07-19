import { pool } from '../config/database.js';
import { randomUUID } from 'crypto';
import { analyzeChestXray } from '../services/aiService.js';
import { validateAnalyzeRequest } from '../utils/validators.js';

export const analyzeCxr = async (req, res) => {
  const errors = validateAnalyzeRequest(req.body, req.file);
  if (errors.length > 0) {
    if (req.file?.path) await fs.rm(req.file.path, { force: true });
    return res.status(400).json({ error: "Invalid request", details: errors });
  }

  try {
    // Call Python AI service
    const aiResults = await analyzeChestXray({
      age: req.body.age,
      gender: req.body.gender,
      clinicalSymptoms: req.body.clinicalSymptoms || '',
      clinicalHistory: req.body.clinicalHistory || ''
    });

    const patientUUID = randomUUID();
    const connection = await pool.getConnection();

    try {
      await connection.beginTransaction();

      // Insert patient
      await connection.query(
        `INSERT INTO patients (
          id, external_patient_id, name, age, gender, scan_type, scan_date,
          clinical_symptoms, clinical_history, image_path, status, priority
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
          req.file.path,
          aiResults.priority
        ]
      );

      // Insert findings
      const insertedFindings = [];
      for (const finding of aiResults.findings) {
        const findingId = randomUUID();
        await connection.query(
          `INSERT INTO findings (
            id, patient_id, name, probability, color, description, recommendations, bounding_box
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            findingId,
            patientUUID,
            finding.name,
            finding.probability,
            finding.color,
            finding.description,
            JSON.stringify(finding.recommendations),
            JSON.stringify(finding.boundingBox)
          ]
        );
        insertedFindings.push({ ...finding, id: findingId });
      }

      await connection.commit();

      const [patientRows] = await connection.query(
        "SELECT * FROM patients WHERE id = ?",
        [patientUUID]
      );

      return res.status(201).json({
        patient: normalizePatient(patientRows[0], insertedFindings),
        aiFindings: insertedFindings,
        heatmapUrl: `/heatmap/${patientUUID}`,
        model: "CheXNet-14",
        totalDiseases: 14,
        detectedDiseases: insertedFindings.length,
        message: "CXR analysis completed using CheXNet-14."
      });

    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    if (req.file?.path) await fs.rm(req.file.path, { force: true });
    throw error;
  }
};

export const getPatients = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const [patients] = await connection.query(
      "SELECT * FROM patients ORDER BY created_at DESC LIMIT 100"
    );
  } finally {
    connection.release();
  }
};

export const getPatientById = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    const [patients] = await connection.query(
      "SELECT * FROM patients WHERE id = ?",
      [req.params.id]
    );
  } finally {
    connection.release();
  }
};

export const updatePatient = async (req, res) => {
};

export const patchPatient = async (req, res) => {
};

export const deletePatient = async (req, res) => {
};
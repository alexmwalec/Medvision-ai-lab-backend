const crypto = require("crypto");
const { pool } = require("../config/database");

/**
 * Create a new patient/scan record.
 * Returns the generated UUID (patients.id).
 */
async function createPatientScan({
  externalPatientId = null,
  name,
  age = null,
  gender = null,
  scanType = "Chest X-ray",
  scanDate = null,
  clinicalSymptoms = null,
  clinicalHistory = null,
  imagePath = null,
  priority = "medium",
}) {
  const id = crypto.randomUUID();

  await pool.query(
    `INSERT INTO patients
      (id, external_patient_id, name, age, gender, scan_type, scan_date,
       clinical_symptoms, clinical_history, image_path, status, priority)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      externalPatientId,
      name,
      age,
      gender,
      scanType,
      scanDate,
      clinicalSymptoms,
      clinicalHistory,
      imagePath,
      "pending",
      priority,
    ]
  );

  return id;
}

/**
 * Update a patient/scan record once inference completes — sets the
 * heatmap path and marks status as completed.
 */
async function updateAfterInference(patientId, { heatmapPath, priority }) {
  await pool.query(
    `UPDATE patients
     SET heatmap_path = ?, status = 'completed', priority = ?
     WHERE id = ?`,
    [heatmapPath, priority, patientId]
  );
}

async function getPatientById(patientId) {
  const [rows] = await pool.query(`SELECT * FROM patients WHERE id = ?`, [patientId]);
  return rows[0] || null;
}

module.exports = {
  createPatientScan,
  updateAfterInference,
  getPatientById,
};

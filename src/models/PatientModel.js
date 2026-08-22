const { pool } = require('../config/database');
const { randomUUID } = require('crypto');

// Maps a raw `patients` row 

function toCamelPatient(row) {
  return {
    id: row.id,
    patientId: row.external_patient_id,
    name: row.name,
    age: row.age,
    gender: row.gender,
    scanType: row.scan_type,
    date: row.scan_date,
    clinicalSymptoms: row.clinical_symptoms,
    clinicalHistory: row.clinical_history,
    // image_path and heatmap_path are relative to the backend uploads folder.
    // Serve them through Express rather than leaking filesystem paths.
    imageUrl: row.image_path ? `/api/uploads/${row.image_path}` : null,
    heatmapUrl: row.heatmap_path ? `/api/uploads/${row.heatmap_path}` : null,
    status: row.status,
    priority: row.priority,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function safeParse(value, fallback) {
  if (value == null) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

class PatientModel {
  static async create(data) {
    const id = randomUUID();
    await pool.query(
      `INSERT INTO patients
        (id, external_patient_id, name, age, gender, scan_type, scan_date,
         clinical_symptoms, clinical_history, image_path, heatmap_path, status, priority)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        data.patientId || null,
        data.name,
        Number(data.age),
        data.gender,
        data.scanType || 'Chest X-ray',
        data.date,
        data.clinicalSymptoms || null,
        data.clinicalHistory || null,
        data.imageFilename || null,
        data.heatmapFilename || null,
        data.status || 'pending',
        data.priority || 'medium'
      ]
    );
    return this.findById(id);
  }

  static async findAll() {
    const [rows] = await pool.query('SELECT * FROM patients ORDER BY created_at DESC LIMIT 200');
    const patients = rows.map(toCamelPatient);

    const [findingRows] = await pool.query('SELECT * FROM findings ORDER BY created_at DESC');
    const byPatient = {};
    findingRows.forEach((f) => {
      if (!byPatient[f.patient_id]) byPatient[f.patient_id] = [];
      byPatient[f.patient_id].push({
        id: f.id,
        name: f.name,
        probability: parseFloat(f.probability),
        color: f.color,
        description: f.description,
        recommendations: safeParse(f.recommendations, []),
        boundingBox: safeParse(f.bounding_box, {})
      });
    });

    return patients.map((p) => ({ ...p, aiFindings: byPatient[p.id] || [] }));
  }

  static async findById(id) {
    const [rows] = await pool.query('SELECT * FROM patients WHERE id = ?', [id]);
    if (rows.length === 0) return null;

    const patient = toCamelPatient(rows[0]);
    const [findingRows] = await pool.query(
      'SELECT * FROM findings WHERE patient_id = ? ORDER BY probability DESC',
      [id]
    );
    patient.aiFindings = findingRows.map((f) => ({
      id: f.id,
      name: f.name,
      probability: parseFloat(f.probability),
      color: f.color,
      description: f.description,
      recommendations: safeParse(f.recommendations, []),
      boundingBox: safeParse(f.bounding_box, {})
    }));

    return patient;
  }

  static async updatePriority(id, priority) {
    await pool.query('UPDATE patients SET priority = ? WHERE id = ?', [priority, id]);
    return this.findById(id);
  }

  static async updateStatus(id, status) {
    await pool.query('UPDATE patients SET status = ? WHERE id = ?', [status, id]);
    return this.findById(id);
  }

  static async delete(id) {
    await pool.query('DELETE FROM patients WHERE id = ?', [id]);
    return { success: true };
  }

  static async getStats() {
    const [rows] = await pool.query(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN priority IN ('critical','high') THEN 1 ELSE 0 END) AS urgent,
        SUM(CASE WHEN status = 'reviewed' THEN 1 ELSE 0 END) AS reviewed,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending
      FROM patients
    `);
    return rows[0];
  }
}

module.exports = PatientModel;

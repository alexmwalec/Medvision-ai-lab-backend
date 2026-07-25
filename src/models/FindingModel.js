const { pool } = require('../config/database');
const { randomUUID } = require('crypto');

class FindingModel {
  static async create(patientId, finding) {
    const id = randomUUID();
    await pool.query(
      `INSERT INTO findings
        (id, patient_id, name, probability, color, description, recommendations, bounding_box)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        patientId,
        finding.name,
        finding.probability,
        finding.color || '#3B82F6',
        finding.description || '',
        JSON.stringify(finding.recommendations || []),
        JSON.stringify(finding.boundingBox || {})
      ]
    );
    return { id, patientId, ...finding };
  }

  static async findByPatientId(patientId) {
    const [rows] = await pool.query(
      'SELECT * FROM findings WHERE patient_id = ? ORDER BY probability DESC',
      [patientId]
    );
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      probability: parseFloat(r.probability),
      color: r.color,
      description: r.description,
      recommendations: JSON.parse(r.recommendations || '[]'),
      boundingBox: JSON.parse(r.bounding_box || '{}')
    }));
  }

  static async deleteByPatientId(patientId) {
    await pool.query('DELETE FROM findings WHERE patient_id = ?', [patientId]);
    return { success: true };
  }
}

module.exports = FindingModel;

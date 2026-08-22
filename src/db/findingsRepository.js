

const crypto = require("crypto");
const { pool } = require("../config/database");

/**
 * Insert one finding row.
 * @param {object} params
 *   patientId, name (disease), probability (0-100), color,
 *   description, recommendations (array/object -> stored as JSON),
 *   boundingBox (object or null -> stored as JSON)
 */
async function insertFinding({
  patientId,
  name,
  probability,
  color = null,
  description = null,
  recommendations = null,
  boundingBox = null,
}) {
  const id = crypto.randomUUID();

  await pool.query(
    `INSERT INTO findings
      (id, patient_id, name, probability, color, description, recommendations, bounding_box)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      patientId,
      name,
      probability,
      color,
      description,
      recommendations ? JSON.stringify(recommendations) : null,
      boundingBox ? JSON.stringify(boundingBox) : null,
    ]
  );

  return id;
}

async function insertFindings(patientId, findings) {
  const insertedIds = [];
  for (const f of findings) {
    const id = await insertFinding({ patientId, ...f });
    insertedIds.push(id);
  }
  return insertedIds;
}

async function getFindingsForPatient(patientId) {
  const [rows] = await pool.query(
    `SELECT * FROM findings WHERE patient_id = ? ORDER BY probability DESC`,
    [patientId]
  );
  return rows;
}

module.exports = {
  insertFinding,
  insertFindings,
  getFindingsForPatient,
};

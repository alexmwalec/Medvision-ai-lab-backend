const { query } = require('../config/database');
const { v4: uuidv4 } = require('uuid');

class FindingModel {
    static async create(patientId, findingData) {
        const {
            name,
            probability,
            color = '#3B82F6',
            description = '',
            recommendations = [],
            boundingBox = {}
        } = findingData;

        const id = uuidv4();

        await query(
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
                JSON.stringify(recommendations),
                JSON.stringify(boundingBox)
            ]
        );

        return this.findById(id);
    }

    // Find finding by ID
    static async findById(id) {
        const rows = await query(
            'SELECT * FROM findings WHERE id = ?',
            [id]
        );

        if (rows.length === 0) return null;

        const finding = rows[0];
        return {
            ...finding,
            recommendations: JSON.parse(finding.recommendations || '[]'),
            boundingBox: JSON.parse(finding.bounding_box || '{}')
        };
    }

    // Get all findings for a patient
    static async findByPatientId(patientId) {
        const rows = await query(
            'SELECT * FROM findings WHERE patient_id = ? ORDER BY created_at DESC',
            [patientId]
        );

        return rows.map(row => ({
            ...row,
            recommendations: JSON.parse(row.recommendations || '[]'),
            boundingBox: JSON.parse(row.bounding_box || '{}')
        }));
    }

    // Delete a finding
    static async delete(id) {
        await query('DELETE FROM findings WHERE id = ?', [id]);
        return { success: true };
    }

    static async deleteByPatientId(patientId) {
        await query('DELETE FROM findings WHERE patient_id = ?', [patientId]);
        return { success: true };
    }
}

module.exports = FindingModel;
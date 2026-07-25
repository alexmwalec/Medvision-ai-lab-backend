const { query } = require('../config/database');
const { v4: uuidv4 } = require('uuid');

class PatientModel {
    static async create(patientData) {
        const {
            name,
            patientId,
            age,
            gender,
            date,
            scanType = 'Chest X-ray',
            clinicalSymptoms,
            clinicalHistory,
            imageUrl,
            publicId
        } = patientData;

        const id = patientId || uuidv4();

        await query(
            `INSERT INTO patients 
             (id, name, patient_id, age, gender, scan_date, scan_type, 
              clinical_symptoms, clinical_history, image_url, public_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                id,
                name,
                patientId || null,
                parseInt(age),
                gender,
                new Date(date),
                scanType,
                clinicalSymptoms || null,
                clinicalHistory || null,
                imageUrl || null,
                publicId || null
            ]
        );

        return await this.findById(id);
    }

    static async findAll() {
        try {
            const rows = await query(`
                SELECT 
                    p.id,
                    p.name,
                    p.patient_id as patientId,
                    p.age,
                    p.gender,
                    p.scan_date as date,
                    p.scan_type as scanType,
                    p.clinical_symptoms as clinicalSymptoms,
                    p.clinical_history as clinicalHistory,
                    p.image_url as imageUrl,
                    p.public_id as publicId,
                    p.priority,
                    p.status,
                    p.review_requested_at as reviewRequestedAt,
                    p.created_at as createdAt,
                    p.updated_at as updatedAt,
                    f.id AS finding_id,
                    f.name AS finding_name,
                    f.probability AS finding_probability,
                    f.color AS finding_color,
                    f.description AS finding_description,
                    f.recommendations AS finding_recommendations,
                    f.bounding_box AS finding_bounding_box
                FROM patients p
                LEFT JOIN findings f ON p.id = f.patient_id
                ORDER BY p.created_at DESC
            `);

            return this.groupPatientsWithFindings(rows);
        } catch (error) {
            console.error('Error in findAll:', error);
            throw error;
        }
    }

    static async findById(id) {
        const rows = await query(`
            SELECT 
                p.id,
                p.name,
                p.patient_id as patientId,
                p.age,
                p.gender,
                p.scan_date as date,
                p.scan_type as scanType,
                p.clinical_symptoms as clinicalSymptoms,
                p.clinical_history as clinicalHistory,
                p.image_url as imageUrl,
                p.public_id as publicId,
                p.priority,
                p.status,
                p.review_requested_at as reviewRequestedAt,
                p.created_at as createdAt,
                p.updated_at as updatedAt,
                f.id AS finding_id,
                f.name AS finding_name,
                f.probability AS finding_probability,
                f.color AS finding_color,
                f.description AS finding_description,
                f.recommendations AS finding_recommendations,
                f.bounding_box AS finding_bounding_box
            FROM patients p
            LEFT JOIN findings f ON p.id = f.patient_id
            WHERE p.id = ?
            ORDER BY f.created_at DESC
        `, [id]);

        if (rows.length === 0) return null;
        return this.groupPatientsWithFindings(rows)[0] || null;
    }

    static async update(id, updateData) {
        const { name, age, gender, priority, status, clinicalSymptoms, clinicalHistory } = updateData;
        
        const updates = [];
        const values = [];

        if (name) { updates.push('name = ?'); values.push(name); }
        if (age) { updates.push('age = ?'); values.push(parseInt(age)); }
        if (gender) { updates.push('gender = ?'); values.push(gender); }
        if (priority) { updates.push('priority = ?'); values.push(priority); }
        if (status) { updates.push('status = ?'); values.push(status); }
        if (clinicalSymptoms !== undefined) { updates.push('clinical_symptoms = ?'); values.push(clinicalSymptoms); }
        if (clinicalHistory !== undefined) { updates.push('clinical_history = ?'); values.push(clinicalHistory); }

        if (updates.length === 0) {
            return await this.findById(id);
        }

        values.push(id);
        await query(
            `UPDATE patients SET ${updates.join(', ')} WHERE id = ?`,
            values
        );

        return await this.findById(id);
    }

    static async updatePriority(id, priority) {
        await query(
            'UPDATE patients SET priority = ? WHERE id = ?',
            [priority, id]
        );
        return await this.findById(id);
    }

    static async updateStatus(id, status) {
        await query(
            'UPDATE patients SET status = ? WHERE id = ?',
            [status, id]
        );
        return await this.findById(id);
    }

    static async requestReview(id) {
        await query(
            `UPDATE patients 
             SET status = 'consulting', 
                 review_requested_at = NOW() 
             WHERE id = ?`,
            [id]
        );
        return await this.findById(id);
    }

    static async delete(id) {
        await query('DELETE FROM patients WHERE id = ?', [id]);
        return { success: true };
    }

    static async getStats() {
        const stats = await query(`
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN priority IN ('critical', 'high') THEN 1 ELSE 0 END) as urgent,
                SUM(CASE WHEN status = 'reviewed' THEN 1 ELSE 0 END) as reviewed,
                SUM(CASE WHEN status = 'consulting' THEN 1 ELSE 0 END) as consulting
            FROM patients
        `);

        return {
            total: stats[0]?.total || 0,
            urgent: stats[0]?.urgent || 0,
            reviewed: stats[0]?.reviewed || 0,
            consulting: stats[0]?.consulting || 0,
            pending: (stats[0]?.total || 0) - (stats[0]?.reviewed || 0) - (stats[0]?.consulting || 0)
        };
    }

    static groupPatientsWithFindings(rows) {
        const patientMap = {};

        rows.forEach(row => {
            if (!patientMap[row.id]) {
                patientMap[row.id] = {
                    id: row.id,
                    name: row.name,
                    patientId: row.patientId,
                    age: row.age,
                    gender: row.gender,
                    date: row.date,
                    scanType: row.scanType,
                    clinicalSymptoms: row.clinicalSymptoms,
                    clinicalHistory: row.clinicalHistory,
                    imageUrl: row.imageUrl,
                    publicId: row.publicId,
                    priority: row.priority || 'medium',
                    status: row.status || 'pending',
                    reviewRequestedAt: row.reviewRequestedAt,
                    createdAt: row.createdAt,
                    updatedAt: row.updatedAt,
                    aiFindings: []
                };
            }

            if (row.finding_id) {
                patientMap[row.id].aiFindings.push({
                    id: row.finding_id,
                    name: row.finding_name,
                    probability: parseFloat(row.finding_probability) || 0,
                    color: row.finding_color || '#3B82F6',
                    description: row.finding_description || '',
                    recommendations: JSON.parse(row.finding_recommendations || '[]'),
                    boundingBox: JSON.parse(row.finding_bounding_box || '{}')
                });
            }
        });

        return Object.values(patientMap);
    }
}

module.exports = PatientModel;
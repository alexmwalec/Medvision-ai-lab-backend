import { query } from "../config/database.js";

export const PatientModel = {
  create: async (data) => {
    const { id, name, age, gender, scan_date, clinical_symptoms, clinical_history, image_path, priority } = data;
    await query(
      `INSERT INTO patients (id, name, age, gender, scan_date, clinical_symptoms, clinical_history, image_path, priority)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, name, age, gender, scan_date, clinical_symptoms, clinical_history, image_path, priority]
    );
    return { id, ...data };
  },

  findAll: async () => {
    const [rows] = await query("SELECT * FROM patients ORDER BY created_at DESC");
    return rows;
  },

  findById: async (id) => {
    const [rows] = await query("SELECT * FROM patients WHERE id = ?", [id]);
    return rows[0] || null;
  },

  update: async (id, data) => {
    const fields = Object.keys(data).map(k => `${k} = ?`).join(", ");
    const values = [...Object.values(data), id];
    await query(`UPDATE patients SET ${fields} WHERE id = ?`, values);
    return PatientModel.findById(id);
  },

  delete: async (id) => {
    await query("DELETE FROM patients WHERE id = ?", [id]);
  },
};
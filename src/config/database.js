import mysql from "mysql2/promise";

const pool = mysql.createPool({
  host: process.env.MYSQL_HOST || "localhost",
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER || "root",
  password: process.env.MYSQL_PASSWORD || "",
  database: process.env.MYSQL_DATABASE || "medvision",
  connectionLimit: 10,
  waitForConnections: true,
});

// Export the query function
export const query = async (sql, params) => {
  const [rows] = await pool.query(sql, params);
  return rows;
};

// Export getConnection function
export const getConnection = async () => {
  return await pool.getConnection();
};

// Export pool for direct access if needed
export { pool };

// Database initialization - Check if tables exist
export const initDatabase = async () => {
  const connection = await pool.getConnection();
  try {
      const [tables] = await connection.query(`
      SELECT COUNT(*) as count 
      FROM information_schema.tables 
      WHERE table_schema = '${process.env.MYSQL_DATABASE || 'medvision'}' 
      AND table_name IN ('patients', 'findings', 'feedback')
    `);

    const existingTables = tables[0].count;
    
    if (existingTables === 3) {
      console.log("All tables already exist!");
      
      // Check if bounding_box column exists
      const [columns] = await connection.query(`
        SELECT COUNT(*) as count 
        FROM information_schema.columns 
        WHERE table_schema = '${process.env.MYSQL_DATABASE || 'medvision'}' 
        AND table_name = 'findings' 
        AND column_name = 'bounding_box'
      `);
      
      if (columns[0].count === 0) {
        console.log("Adding bounding_box column to findings table...");
        await connection.query(`
          ALTER TABLE findings 
          ADD COLUMN bounding_box JSON
        `);
        console.log(" bounding_box column added successfully!");
      } else {
        console.log(" bounding_box column already exists");
      }
      
      return true;
    } else {
      console.log("Some tables are missing. Creating tables...");
      
      // Create patients table
      await connection.query(`
        CREATE TABLE IF NOT EXISTS patients (
          id VARCHAR(36) PRIMARY KEY,
          name VARCHAR(255) NOT NULL,
          age INT,
          gender VARCHAR(50),
          scan_type VARCHAR(100) DEFAULT 'Chest X-ray',
          scan_date DATE,
          clinical_symptoms TEXT,
          clinical_history TEXT,
          image_path VARCHAR(500),
          status VARCHAR(50) DEFAULT 'pending',
          priority VARCHAR(50) DEFAULT 'medium',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
      `);

      // Create findings table
      await connection.query(`
        CREATE TABLE IF NOT EXISTS findings (
          id VARCHAR(36) PRIMARY KEY,
          patient_id VARCHAR(36) NOT NULL,
          name VARCHAR(255) NOT NULL,
          probability DECIMAL(5,2) NOT NULL,
          color VARCHAR(50),
          description TEXT,
          recommendations JSON,
          bounding_box JSON,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE CASCADE
        )
      `);

      // Create feedback table
      await connection.query(`
        CREATE TABLE IF NOT EXISTS feedback (
          id VARCHAR(36) PRIMARY KEY,
          patient_id VARCHAR(36),
          type VARCHAR(100) NOT NULL,
          status VARCHAR(50),
          consultation_notes TEXT,
          confidence_level VARCHAR(50),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE SET NULL
        )
      `);
      
      console.log("Tables created successfully!");
      return true;
    }
    
  } catch (error) {
    console.error("Database initialization error:", error.message);
    throw error;
  } finally {
    connection.release();
  }
};
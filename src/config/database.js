import mysql from "mysql2/promise";

export const pool = mysql.createPool({
  host: process.env.MYSQL_HOST || "localhost",
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER || "root",
  password: process.env.MYSQL_PASSWORD || "",
  database: process.env.MYSQL_DATABASE || "medvision",
  connectionLimit: Number(process.env.MYSQL_POOL_MAX || 10),
  waitForConnections: true,
  queueLimit: 0,
  connectTimeout: 5000,
  ...(process.env.MYSQL_SSL === "true" && {
    ssl: { rejectUnauthorized: false }
  })
});

export let dbReady = false;

export const initDatabase = async () => {
  const connection = await pool.getConnection();
  
  try {
    const [tables] = await connection.query(`
      SELECT COUNT(*) as count 
      FROM information_schema.tables 
      WHERE table_schema = 'medvision' 
      AND table_name IN ('patients', 'findings', 'feedback')
    `);

    if (tables[0].count < 3) {
      console.log("Some tables are missing. Please run the SQL script manually.");
    } else {
      console.log("All tables exist!");
      
      const [columns] = await connection.query(`
        SELECT COUNT(*) as count 
        FROM information_schema.columns 
        WHERE table_schema = 'medvision' 
        AND table_name = 'findings' 
        AND column_name = 'bounding_box'
      `);
      
      if (columns[0].count === 0) {
        console.log("📦 Adding bounding_box column to findings table...");
        await connection.query(`
          ALTER TABLE findings 
          ADD COLUMN bounding_box JSON
        `);
        console.log("bounding_box column added successfully!");
      }
    }

    await connection.query("SELECT 1");
    dbReady = true;
    
  } catch (error) {
    console.error("Database connection error:", error.message);
    throw error;
  } finally {
    connection.release();
  }
};
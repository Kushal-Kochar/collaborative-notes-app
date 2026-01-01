const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 3306,
  database: process.env.DB_NAME || 'collaborative_notes',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

const connect = async () => {
  try {
    await pool.query('SELECT 1');
    await initializeTables();
    return true;
  } catch (error) {
    throw error;
  }
};

const createIndexIfNotExists = async (connection, indexName, tableName, columns) => {
  try {
    const [indexes] = await connection.query(`
      SELECT COUNT(*) as count 
      FROM information_schema.statistics 
      WHERE table_schema = ? 
      AND table_name = ? 
      AND index_name = ?
    `, [process.env.DB_NAME || 'collaborative_notes', tableName, indexName]);

    if (indexes[0].count === 0) {
      await connection.query(`CREATE INDEX ${indexName} ON ${tableName}(${columns})`);
    }
  } catch (error) {
    if (error.code !== 'ER_DUP_KEYNAME') {
      throw error;
    }
  }
};

const createFulltextIndexIfNotExists = async (connection, indexName, tableName, columns) => {
  try {
    const [indexes] = await connection.query(`
      SELECT COUNT(*) as count 
      FROM information_schema.statistics 
      WHERE table_schema = ? 
      AND table_name = ? 
      AND index_name = ?
    `, [process.env.DB_NAME || 'collaborative_notes', tableName, indexName]);

    if (indexes[0].count === 0) {
      await connection.query(`CREATE FULLTEXT INDEX ${indexName} ON ${tableName}(${columns})`);
    }
  } catch (error) {
    if (error.code !== 'ER_DUP_KEYNAME') {
      throw error;
    }
  }
};

const initializeTables = async () => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    await connection.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        role VARCHAR(20) DEFAULT 'Viewer',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        CONSTRAINT chk_role CHECK (role IN ('Admin', 'Editor', 'Viewer'))
      )
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS notes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        content TEXT,
        owner_id INT NOT NULL,
        share_token VARCHAR(100) UNIQUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS note_collaborators (
        id INT AUTO_INCREMENT PRIMARY KEY,
        note_id INT NOT NULL,
        user_id INT NOT NULL,
        role VARCHAR(20) DEFAULT 'Viewer',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT chk_collab_role CHECK (role IN ('Editor', 'Viewer')),
        FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE KEY unique_collaborator (note_id, user_id)
      )
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS activity_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT,
        note_id INT,
        action VARCHAR(50) NOT NULL,
        details JSON,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
      )
    `);

    await createIndexIfNotExists(connection, 'idx_notes_owner', 'notes', 'owner_id');
    await createIndexIfNotExists(connection, 'idx_notes_share_token', 'notes', 'share_token');
    await createIndexIfNotExists(connection, 'idx_collaborators_note', 'note_collaborators', 'note_id');
    await createIndexIfNotExists(connection, 'idx_collaborators_user', 'note_collaborators', 'user_id');
    await createIndexIfNotExists(connection, 'idx_activity_user', 'activity_logs', 'user_id');
    await createIndexIfNotExists(connection, 'idx_activity_note', 'activity_logs', 'note_id');
    await createFulltextIndexIfNotExists(connection, 'idx_notes_search', 'notes', 'title, content');

    await connection.commit();
    console.log('Database tables initialized');
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

module.exports = {
  pool,
  connect
};

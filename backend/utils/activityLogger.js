const db = require('../config/database');

const logActivity = async (userId, noteId, action, details = {}) => {
  try {
    await db.pool.query(
      'INSERT INTO activity_logs (user_id, note_id, action, details) VALUES (?, ?, ?, ?)',
      [userId, noteId, action, JSON.stringify(details)]
    );
  } catch (error) {
    console.error('Error logging activity:', error);
  }
};

module.exports = { logActivity };

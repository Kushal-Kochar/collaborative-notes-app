const express = require('express');
const db = require('../config/database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

router.get('/', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const { noteId, limit = 50 } = req.query;

    let query = `
      SELECT al.*, u.username, n.title as note_title
      FROM activity_logs al
      LEFT JOIN users u ON al.user_id = u.id
      LEFT JOIN notes n ON al.note_id = n.id
      WHERE al.user_id = ?
    `;
    const params = [userId];

    if (noteId) {
      query += ' AND al.note_id = ?';
      params.push(noteId);
      query += ' ORDER BY al.created_at DESC LIMIT ?';
      params.push(parseInt(limit));
    } else {
      query += ' ORDER BY al.created_at DESC LIMIT ?';
      params.push(parseInt(limit));
    }

    const [result] = await db.pool.query(query, params);

    res.json({ activities: result });
  } catch (error) {
    console.error('Get activity logs error:', error);
    res.status(500).json({ error: 'Failed to fetch activity logs' });
  }
});

router.get('/note/:noteId', authenticate, async (req, res) => {
  try {
    const { noteId } = req.params;
    const userId = req.user.id;

    const [noteAccessCheck] = await db.pool.query(
      `SELECT n.owner_id FROM notes n
       LEFT JOIN note_collaborators nc ON n.id = nc.note_id
       WHERE n.id = ? AND (n.owner_id = ? OR nc.user_id = ?)`,
      [noteId, userId, userId]
    );

    if (noteAccessCheck.length === 0) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const [result] = await db.pool.query(`
      SELECT al.*, u.username
      FROM activity_logs al
      LEFT JOIN users u ON al.user_id = u.id
      WHERE al.note_id = ?
      ORDER BY al.created_at DESC
      LIMIT 100
    `, [noteId]);

    res.json({ activities: result });
  } catch (error) {
    console.error('Get note activity logs error:', error);
    res.status(500).json({ error: 'Failed to fetch activity logs' });
  }
});

module.exports = router;

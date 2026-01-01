const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { checkNoteAccess } = require('../middleware/noteAccess');

const router = express.Router();

router.post('/:noteId/generate', authenticate, checkNoteAccess, async (req, res) => {
  try {
    const { noteId } = req.params;

    const shareToken = uuidv4();

    await db.pool.query(
      'UPDATE notes SET share_token = ? WHERE id = ?',
      [shareToken, noteId]
    );

    res.json({ shareToken, shareUrl: `/share/${shareToken}` });
  } catch (error) {
    console.error('Generate share link error:', error);
    res.status(500).json({ error: 'Failed to generate share link' });
  }
});

router.delete('/:noteId/revoke', authenticate, checkNoteAccess, async (req, res) => {
  try {
    const { noteId } = req.params;

    await db.pool.query(
      'UPDATE notes SET share_token = NULL WHERE id = ?',
      [noteId]
    );

    res.json({ message: 'Share link revoked successfully' });
  } catch (error) {
    console.error('Revoke share link error:', error);
    res.status(500).json({ error: 'Failed to revoke share link' });
  }
});

router.get('/:shareToken', async (req, res) => {
  try {
    const { shareToken } = req.params;

    const [result] = await db.pool.query(`
      SELECT n.id, n.title, n.content, n.created_at, n.updated_at,
             u.username as owner_username
      FROM notes n
      LEFT JOIN users u ON n.owner_id = u.id
      WHERE n.share_token = ?
    `, [shareToken]);

    if (result.length === 0) {
      return res.status(404).json({ error: 'Shared note not found or link expired' });
    }

    res.json({ note: result[0] });
  } catch (error) {
    console.error('Get shared note error:', error);
    res.status(500).json({ error: 'Failed to fetch shared note' });
  }
});

module.exports = router;

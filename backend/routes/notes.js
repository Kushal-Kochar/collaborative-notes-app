const express = require('express');
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const { authenticate } = require('../middleware/auth');
const { checkNoteAccess, checkNoteEditAccess } = require('../middleware/noteAccess');
const { logActivity } = require('../utils/activityLogger');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();

router.get('/', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;

    const [result] = await db.pool.query(`
      SELECT DISTINCT n.id, n.title, n.content, n.owner_id, n.created_at, n.updated_at,
             u.username as owner_username
      FROM notes n
      LEFT JOIN users u ON n.owner_id = u.id
      LEFT JOIN note_collaborators nc ON n.id = nc.note_id
      WHERE n.owner_id = ? OR nc.user_id = ?
      ORDER BY n.updated_at DESC
    `, [userId, userId]);

    res.json({ notes: result });
  } catch (error) {
    console.error('Get notes error:', error);
    res.status(500).json({ error: 'Failed to fetch notes' });
  }
});

router.get('/:noteId', authenticate, checkNoteAccess, async (req, res) => {
  try {
    const { noteId } = req.params;

    const [noteResult] = await db.pool.query(`
      SELECT n.*, u.username as owner_username
      FROM notes n
      LEFT JOIN users u ON n.owner_id = u.id
      WHERE n.id = ?
    `, [noteId]);

    if (noteResult.length === 0) {
      return res.status(404).json({ error: 'Note not found' });
    }

    const [collaboratorsResult] = await db.pool.query(`
      SELECT nc.user_id, nc.role, u.username, u.email
      FROM note_collaborators nc
      JOIN users u ON nc.user_id = u.id
      WHERE nc.note_id = ?
    `, [noteId]);

    const note = noteResult[0];
    note.collaborators = collaboratorsResult;
    note.access = req.noteAccess;

    await logActivity(req.user.id, noteId, 'VIEW_NOTE');

    res.json({ note });
  } catch (error) {
    console.error('Get note error:', error);
    res.status(500).json({ error: 'Failed to fetch note' });
  }
});

router.post('/',
  authenticate,
  [
    body('title').trim().notEmpty().withMessage('Title is required'),
    body('content').optional()
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { title, content = '' } = req.body;
      const userId = req.user.id;

      const [result] = await db.pool.query(
        'INSERT INTO notes (title, content, owner_id) VALUES (?, ?, ?)',
        [title, content, userId]
      );

      const [noteResult] = await db.pool.query(
        'SELECT * FROM notes WHERE id = ?',
        [result.insertId]
      );

      const note = noteResult[0];

      await logActivity(userId, note.id, 'CREATE_NOTE', { title });

      res.status(201).json({ note });
    } catch (error) {
      console.error('Create note error:', error);
      res.status(500).json({ error: 'Failed to create note' });
    }
  }
);

router.put('/:noteId',
  authenticate,
  checkNoteEditAccess,
  [
    body('title').optional({ nullable: true, checkFalsy: true }),
    body('content').optional({ nullable: true, checkFalsy: true })
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { noteId } = req.params;
      const { title, content } = req.body;

      const updateFields = [];
      const updateValues = [];

      if (title !== undefined && title !== null) {
        const trimmedTitle = title.trim();
        updateFields.push('title = ?');
        updateValues.push(trimmedTitle.length > 0 ? trimmedTitle : 'Untitled Note');
      }

      if (content !== undefined && content !== null) {
        updateFields.push('content = ?');
        updateValues.push(content);
      }

      if (updateFields.length === 0) {
        return res.status(400).json({ error: 'No fields to update' });
      }

      updateValues.push(noteId);

      const query = `UPDATE notes SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;

      await db.pool.query(query, updateValues);

      const [result] = await db.pool.query('SELECT * FROM notes WHERE id = ?', [noteId]);

      if (result.length === 0) {
        return res.status(404).json({ error: 'Note not found' });
      }

      const note = result[0];

      await logActivity(req.user.id, noteId, 'UPDATE_NOTE', { title: note.title });

      res.json({ note });
    } catch (error) {
      console.error('Update note error:', error);
      res.status(500).json({ error: 'Failed to update note' });
    }
  }
);

router.delete('/:noteId', authenticate, checkNoteEditAccess, async (req, res) => {
  try {
    const { noteId } = req.params;

    const [noteResult] = await db.pool.query('SELECT title FROM notes WHERE id = ?', [noteId]);
    
    if (noteResult.length === 0) {
      return res.status(404).json({ error: 'Note not found' });
    }

    await db.pool.query('DELETE FROM notes WHERE id = ?', [noteId]);

    await logActivity(req.user.id, noteId, 'DELETE_NOTE', { title: noteResult[0].title });

    res.json({ message: 'Note deleted successfully' });
  } catch (error) {
    console.error('Delete note error:', error);
    res.status(500).json({ error: 'Failed to delete note' });
  }
});

router.post('/:noteId/collaborators',
  authenticate,
  checkNoteEditAccess,
  [
    body('email').isEmail().withMessage('Valid email required'),
    body('role').isIn(['Editor', 'Viewer']).withMessage('Role must be Editor or Viewer')
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { noteId } = req.params;
      const { email, role } = req.body;

      if (!email || !email.trim()) {
        return res.status(400).json({ error: 'Email is required' });
      }

      const [userResult] = await db.pool.query('SELECT id FROM users WHERE email = ?', [email.trim()]);

      if (userResult.length === 0) {
        return res.status(404).json({ error: 'User not found. Please make sure the user has registered an account with this email.' });
      }

      const collaboratorId = userResult[0].id;

      const [noteResult] = await db.pool.query('SELECT owner_id FROM notes WHERE id = ?', [noteId]);
      if (noteResult[0].owner_id === collaboratorId) {
        return res.status(400).json({ error: 'Owner cannot be added as collaborator' });
      }

      const [result] = await db.pool.query(
        `INSERT INTO note_collaborators (note_id, user_id, role)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE role = ?`,
        [noteId, collaboratorId, role, role]
      );

      const [collabResult] = await db.pool.query(
        'SELECT * FROM note_collaborators WHERE note_id = ? AND user_id = ?',
        [noteId, collaboratorId]
      );

      await logActivity(req.user.id, noteId, 'ADD_COLLABORATOR', { email, role });

      res.status(201).json({ collaborator: collabResult[0] });
    } catch (error) {
      console.error('Add collaborator error:', error);
      res.status(500).json({ error: 'Failed to add collaborator' });
    }
  }
);

router.delete('/:noteId/collaborators/:userId',
  authenticate,
  checkNoteEditAccess,
  async (req, res) => {
    try {
      const { noteId, userId } = req.params;

      const [result] = await db.pool.query(
        'DELETE FROM note_collaborators WHERE note_id = ? AND user_id = ?',
        [noteId, userId]
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({ error: 'Collaborator not found' });
      }

      await logActivity(req.user.id, noteId, 'REMOVE_COLLABORATOR', { userId });

      res.json({ message: 'Collaborator removed successfully' });
    } catch (error) {
      console.error('Remove collaborator error:', error);
      res.status(500).json({ error: 'Failed to remove collaborator' });
    }
  }
);

router.get('/search/query', authenticate, async (req, res) => {
  try {
    const { q } = req.query;
    const userId = req.user.id;

    if (!q || q.trim().length === 0) {
      return res.json({ notes: [] });
    }

    const searchTerm = q.trim();

    const [result] = await db.pool.query(`
      SELECT DISTINCT n.id, n.title, n.content, n.owner_id, n.created_at, n.updated_at,
             u.username as owner_username
      FROM notes n
      LEFT JOIN users u ON n.owner_id = u.id
      LEFT JOIN note_collaborators nc ON n.id = nc.note_id
      WHERE (n.owner_id = ? OR nc.user_id = ?)
        AND (n.title LIKE ? OR n.content LIKE ?)
      ORDER BY n.updated_at DESC
    `, [userId, userId, `%${searchTerm}%`, `%${searchTerm}%`]);

    res.json({ notes: result });
  } catch (error) {
    console.error('Search notes error:', error);
    res.status(500).json({ error: 'Search failed' });
  }
});

module.exports = router;

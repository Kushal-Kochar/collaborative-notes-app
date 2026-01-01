const db = require('../config/database');

const checkNoteAccess = async (req, res, next) => {
  try {
    const { noteId } = req.params;
    const userId = req.user.id;

    const [noteResult] = await db.pool.query(
      'SELECT owner_id FROM notes WHERE id = ?',
      [noteId]
    );

    if (noteResult.length === 0) {
      return res.status(404).json({ error: 'Note not found' });
    }

    const note = noteResult[0];

    if (note.owner_id === userId) {
      req.noteAccess = { role: 'Owner', canEdit: true, canDelete: true };
      return next();
    }

    const [collaboratorResult] = await db.pool.query(
      'SELECT role FROM note_collaborators WHERE note_id = ? AND user_id = ?',
      [noteId, userId]
    );

    if (collaboratorResult.length === 0) {
      return res.status(403).json({ error: 'Access denied to this note' });
    }

    const collaboratorRole = collaboratorResult[0].role;
    req.noteAccess = {
      role: collaboratorRole,
      canEdit: collaboratorRole === 'Editor',
      canDelete: false
    };

    next();
  } catch (error) {
    console.error('Note access check error:', error);
    res.status(500).json({ error: 'Error checking note access' });
  }
};

const checkNoteEditAccess = async (req, res, next) => {
  try {
    const { noteId } = req.params;
    const userId = req.user.id;

    const [noteResult] = await db.pool.query(
      'SELECT owner_id FROM notes WHERE id = ?',
      [noteId]
    );

    if (noteResult.length === 0) {
      return res.status(404).json({ error: 'Note not found' });
    }

    const note = noteResult[0];

    if (note.owner_id === userId) {
      return next();
    }

    const [collaboratorResult] = await db.pool.query(
      'SELECT role FROM note_collaborators WHERE note_id = ? AND user_id = ? AND role = ?',
      [noteId, userId, 'Editor']
    );

    if (collaboratorResult.length === 0) {
      return res.status(403).json({ error: 'Edit access denied' });
    }

    next();
  } catch (error) {
    console.error('Note edit access check error:', error);
    res.status(500).json({ error: 'Error checking edit access' });
  }
};

module.exports = { checkNoteAccess, checkNoteEditAccess };

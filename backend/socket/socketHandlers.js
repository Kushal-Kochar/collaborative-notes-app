const jwt = require('jsonwebtoken');
const db = require('../config/database');
const { logActivity } = require('../utils/activityLogger');

const connectedUsers = new Map();
const noteRooms = new Map();

const authenticateSocket = async (socket, next) => {
  try {
    const token = socket.handshake.auth.token;
    
    if (!token) {
      return next(new Error('Authentication required'));
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    const [result] = await db.pool.query(
      'SELECT id, username, email, role FROM users WHERE id = ?',
      [decoded.userId]
    );

    if (result.length === 0) {
      return next(new Error('User not found'));
    }

    socket.user = result[0];
    next();
  } catch (error) {
    next(new Error('Authentication failed'));
  }
};

const socketHandlers = (io) => {
  io.use(authenticateSocket);

  io.on('connection', (socket) => {
    const userId = socket.user.id;
    connectedUsers.set(userId, socket.id);

    socket.on('join-note', async (noteId) => {
      try {
        const [noteResult] = await db.pool.query(
          'SELECT owner_id FROM notes WHERE id = ?',
          [noteId]
        );

        if (noteResult.length === 0) {
          socket.emit('error', { message: 'Note not found' });
          return;
        }

        const note = noteResult[0];

        if (note.owner_id === userId) {
          socket.join(`note-${noteId}`);
          socket.emit('joined-note', { noteId });
          return;
        }

        const [collaboratorResult] = await db.pool.query(
          'SELECT role FROM note_collaborators WHERE note_id = ? AND user_id = ?',
          [noteId, userId]
        );

        if (collaboratorResult.length === 0) {
          socket.emit('error', { message: 'Access denied' });
          return;
        }

        socket.join(`note-${noteId}`);
        socket.emit('joined-note', { noteId });

        if (!noteRooms.has(noteId)) {
          noteRooms.set(noteId, new Set());
        }
        noteRooms.get(noteId).add(userId);

        io.to(`note-${noteId}`).emit('user-joined', {
          userId,
          username: socket.user.username
        });
      } catch (error) {
        console.error('Join note error:', error);
        socket.emit('error', { message: 'Failed to join note' });
      }
    });

    socket.on('leave-note', (noteId) => {
      socket.leave(`note-${noteId}`);
      
      if (noteRooms.has(noteId)) {
        noteRooms.get(noteId).delete(userId);
        if (noteRooms.get(noteId).size === 0) {
          noteRooms.delete(noteId);
        }
      }

      io.to(`note-${noteId}`).emit('user-left', {
        userId,
        username: socket.user.username
      });
    });

    socket.on('note-update', async (data) => {
      try {
        const { noteId, title, content } = data;

        const [noteResult] = await db.pool.query(
          'SELECT owner_id FROM notes WHERE id = ?',
          [noteId]
        );

        if (noteResult.length === 0) {
          socket.emit('error', { message: 'Note not found' });
          return;
        }

        const note = noteResult[0];

        if (note.owner_id !== userId) {
          const [collaboratorResult] = await db.pool.query(
            'SELECT role FROM note_collaborators WHERE note_id = ? AND user_id = ? AND role = ?',
            [noteId, userId, 'Editor']
          );

          if (collaboratorResult.length === 0) {
            socket.emit('error', { message: 'Edit access denied' });
            return;
          }
        }

        const updateFields = [];
        const updateValues = [];

        if (title !== undefined) {
          updateFields.push('title = ?');
          updateValues.push(title);
        }

        if (content !== undefined) {
          updateFields.push('content = ?');
          updateValues.push(content);
        }

        if (updateFields.length === 0) {
          return;
        }

        updateValues.push(noteId);

        const query = `UPDATE notes SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
        await db.pool.query(query, updateValues);

        const [result] = await db.pool.query('SELECT * FROM notes WHERE id = ?', [noteId]);

        if (result.length > 0) {
          const updatedNote = result[0];

          socket.to(`note-${noteId}`).emit('note-updated', {
            noteId,
            title: updatedNote.title,
            content: updatedNote.content,
            updatedAt: updatedNote.updated_at,
            updatedBy: {
              id: userId,
              username: socket.user.username
            }
          });

          await logActivity(userId, noteId, 'REALTIME_UPDATE', {
            title: updatedNote.title
          });
        }
      } catch (error) {
        console.error('Note update error:', error);
        socket.emit('error', { message: 'Failed to update note' });
      }
    });

    socket.on('typing', (data) => {
      const { noteId } = data;
      socket.to(`note-${noteId}`).emit('user-typing', {
        userId,
        username: socket.user.username
      });
    });

    socket.on('disconnect', () => {
      connectedUsers.delete(userId);
      
      noteRooms.forEach((users, noteId) => {
        if (users.has(userId)) {
          users.delete(userId);
          io.to(`note-${noteId}`).emit('user-left', {
            userId,
            username: socket.user.username
          });
        }
      });
    });
  });
};

module.exports = socketHandlers;

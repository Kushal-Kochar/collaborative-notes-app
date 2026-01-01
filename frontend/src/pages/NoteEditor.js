import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { useSocket } from '../context/SocketContext';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import './NoteEditor.css';

const NoteEditor = () => {
  const { noteId } = useParams();
  const navigate = useNavigate();
  const { socket } = useSocket();
  const { user } = useAuth();
  const [note, setNote] = useState(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [collaborators, setCollaborators] = useState([]);
  const [shareToken, setShareToken] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [typingUsers, setTypingUsers] = useState([]);
  const [collaboratorEmail, setCollaboratorEmail] = useState('');
  const [collaboratorRole, setCollaboratorRole] = useState('Editor');
  const [activities, setActivities] = useState([]);
  const [showActivities, setShowActivities] = useState(false);
  const titleTimeoutRef = useRef(null);
  const contentTimeoutRef = useRef(null);
  const isTypingRef = useRef(false);

  useEffect(() => {
    fetchNote();
    fetchActivities();
    return () => {
      if (socket) {
        socket.emit('leave-note', noteId);
      }
    };
  }, [noteId]);

  useEffect(() => {
    if (socket && note) {
      socket.emit('join-note', noteId);

      socket.on('joined-note', () => {
        // Successfully joined note room
      });

      socket.on('note-updated', (data) => {
        if (data.updatedBy.id !== user?.id) {
          setTitle(data.title);
          setContent(data.content);
          fetchNote();
        }
      });

      socket.on('user-joined', (data) => {
        // User joined notification handled
      });

      socket.on('user-left', (data) => {
        // User left notification handled
      });

      socket.on('user-typing', (data) => {
        setTypingUsers(prev => {
          const filtered = prev.filter(u => u.userId !== data.userId);
          return [...filtered, data];
        });

        setTimeout(() => {
          setTypingUsers(prev => prev.filter(u => u.userId !== data.userId));
        }, 3000);
      });

      return () => {
        socket.off('joined-note');
        socket.off('note-updated');
        socket.off('user-joined');
        socket.off('user-left');
        socket.off('user-typing');
      };
    }
  }, [socket, note, noteId]);

  const fetchNote = async () => {
    try {
      setLoading(true);
      const response = await api.get(`/notes/${noteId}`);
      const noteData = response.data.note;
      setNote(noteData);
      setTitle(noteData.title);
      setContent(noteData.content || '');
      setCollaborators(noteData.collaborators || []);
      setShareToken(noteData.share_token || '');
      setError('');
    } catch (error) {
      setError('Failed to load note');
      console.error(error);
      if (error.response?.status === 404 || error.response?.status === 403) {
        navigate('/dashboard');
      }
    } finally {
      setLoading(false);
    }
  };

  const fetchActivities = async () => {
    try {
      const response = await api.get(`/activity/note/${noteId}`);
      setActivities(response.data.activities || []);
    } catch (error) {
      console.error('Failed to fetch activities:', error);
    }
  };

  const handleTitleChange = (e) => {
    const newTitle = e.target.value;
    setTitle(newTitle);

    if (socket && !isTypingRef.current) {
      isTypingRef.current = true;
      socket.emit('typing', { noteId });
      setTimeout(() => {
        isTypingRef.current = false;
      }, 3000);
    }

    if (titleTimeoutRef.current) {
      clearTimeout(titleTimeoutRef.current);
    }

    titleTimeoutRef.current = setTimeout(() => {
      saveNote({ title: newTitle });
    }, 1000);
  };

  const handleContentChange = (e) => {
    const newContent = e.target.value;
    setContent(newContent);

    if (socket && !isTypingRef.current) {
      isTypingRef.current = true;
      socket.emit('typing', { noteId });
      setTimeout(() => {
        isTypingRef.current = false;
      }, 3000);
    }

    if (contentTimeoutRef.current) {
      clearTimeout(contentTimeoutRef.current);
    }

    contentTimeoutRef.current = setTimeout(() => {
      saveNote({ content: newContent });
    }, 1000);
  };

  const saveNote = async (updates) => {
    try {
      setSaving(true);
      if (socket) {
        socket.emit('note-update', {
          noteId,
          title: updates.title !== undefined ? updates.title : title,
          content: updates.content !== undefined ? updates.content : content
        });
      }
      await api.put(`/notes/${noteId}`, updates);
      setError(''); // Clear any previous errors on successful save
    } catch (error) {
      console.error('Save error:', error);
      const errorMessage = error.response?.data?.error || error.response?.data?.errors?.[0]?.msg || 'Failed to save note';
      if (errorMessage !== 'No fields to update') {
        setError(errorMessage);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleAddCollaborator = async (e) => {
    e.preventDefault();
    if (!collaboratorEmail || !collaboratorEmail.trim()) {
      setError('Please enter an email address');
      return;
    }
    try {
      setError('');
      await api.post(`/notes/${noteId}/collaborators`, {
        email: collaboratorEmail.trim(),
        role: collaboratorRole
      });
      setCollaboratorEmail('');
      fetchNote();
      if (showActivities) {
        fetchActivities(); // Refresh activities after adding collaborator
      }
    } catch (error) {
      const errorMessage = error.response?.data?.error || error.response?.data?.errors?.[0]?.msg || 'Failed to add collaborator';
      setError(errorMessage);
    }
  };

  const handleRemoveCollaborator = async (userId) => {
    try {
      await api.delete(`/notes/${noteId}/collaborators/${userId}`);
      fetchNote();
      if (showActivities) {
        fetchActivities(); // Refresh activities after removing collaborator
      }
    } catch (error) {
      setError('Failed to remove collaborator');
    }
  };

  const handleGenerateShareLink = async () => {
    try {
      const response = await api.post(`/share/${noteId}/generate`);
      setShareToken(response.data.shareToken);
      const shareUrl = `${window.location.origin}/share/${response.data.shareToken}`;
      navigator.clipboard.writeText(shareUrl);
      alert('Share link copied to clipboard!');
    } catch (error) {
      setError('Failed to generate share link');
    }
  };

  const handleRevokeShareLink = async () => {
    try {
      await api.delete(`/share/${noteId}/revoke`);
      setShareToken('');
    } catch (error) {
      setError('Failed to revoke share link');
    }
  };

  if (loading) {
    return (
      <div>
        <Navbar />
        <div className="loading">Loading note...</div>
      </div>
    );
  }

  if (!note) {
    return (
      <div>
        <Navbar />
        <div className="error-message">Note not found</div>
      </div>
    );
  }

  const canEdit = note.access?.canEdit !== false;

  return (
    <div>
      <Navbar />
      <div className="container">
        <div className="editor-header">
          <button onClick={() => navigate('/dashboard')} className="btn btn-secondary">
            ← Back
          </button>
          {saving && <span className="saving-indicator">Saving...</span>}
          {typingUsers.length > 0 && (
            <span className="typing-indicator">
              {typingUsers.map(u => u.username).join(', ')} typing...
            </span>
          )}
        </div>

        {error && <div className="error-message">{error}</div>}

        <div className="editor-container">
          <div className="editor-main">
            <input
              type="text"
              value={title}
              onChange={handleTitleChange}
              disabled={!canEdit}
              className="note-title-input"
              placeholder="Note title"
            />
            <textarea
              value={content}
              onChange={handleContentChange}
              disabled={!canEdit}
              className="note-content-input"
              placeholder="Start writing..."
            />
          </div>

          <div className="editor-sidebar">
            <div className="sidebar-section">
              <h3>Collaborators</h3>
              <div className="collaborators-list">
                <div className="collaborator-item">
                  <span>{note.owner_username}</span>
                  <span className="role-badge owner">Owner</span>
                </div>
                {collaborators.map(collab => (
                  <div key={collab.user_id} className="collaborator-item">
                    <div>
                      <span>{collab.username}</span>
                      <span className="role-badge">{collab.role}</span>
                    </div>
                    {canEdit && (
                      <button
                        onClick={() => handleRemoveCollaborator(collab.user_id)}
                        className="btn-remove"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {canEdit && (
                <form onSubmit={handleAddCollaborator} className="add-collaborator-form">
                  <input
                    type="email"
                    value={collaboratorEmail}
                    onChange={(e) => setCollaboratorEmail(e.target.value)}
                    placeholder="Email address"
                    required
                  />
                  <select
                    value={collaboratorRole}
                    onChange={(e) => setCollaboratorRole(e.target.value)}
                  >
                    <option value="Editor">Editor</option>
                    <option value="Viewer">Viewer</option>
                  </select>
                  <button type="submit" className="btn btn-primary btn-sm">
                    Add
                  </button>
                </form>
              )}
            </div>

            <div className="sidebar-section">
              <h3>Share</h3>
              {shareToken ? (
                <div>
                  <p className="share-url">
                    {window.location.origin}/share/{shareToken}
                  </p>
                  <button
                    onClick={handleRevokeShareLink}
                    className="btn btn-danger btn-sm"
                  >
                    Revoke Link
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleGenerateShareLink}
                  className="btn btn-success btn-sm"
                  disabled={!canEdit}
                >
                  Generate Share Link
                </button>
              )}
            </div>

            <div className="sidebar-section">
              <h3>Note Info</h3>
              <p className="note-info">
                Created: {new Date(note.created_at).toLocaleString()}
              </p>
              <p className="note-info">
                Updated: {new Date(note.updated_at).toLocaleString()}
              </p>
            </div>

            <div className="sidebar-section">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <h3>Activity Log</h3>
                <button
                  onClick={() => {
                    setShowActivities(!showActivities);
                    if (!showActivities) {
                      fetchActivities();
                    }
                  }}
                  className="btn btn-secondary btn-sm"
                >
                  {showActivities ? 'Hide' : 'Show'}
                </button>
              </div>
              {showActivities && (
                <div className="activities-list">
                  {activities.length === 0 ? (
                    <p className="note-info">No activities yet</p>
                  ) : (
                    activities.slice(0, 10).map((activity) => (
                      <div key={activity.id} className="activity-item">
                        <div className="activity-header">
                          <span className="activity-user">{activity.username || 'Unknown'}</span>
                          <span className="activity-time">
                            {new Date(activity.created_at).toLocaleString()}
                          </span>
                        </div>
                        <div className="activity-action">
                          {activity.action.replace(/_/g, ' ')}
                        </div>
                        {activity.details && typeof activity.details === 'object' && (
                          <div className="activity-details">
                            {JSON.stringify(activity.details)}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NoteEditor;


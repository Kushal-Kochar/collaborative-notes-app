import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import api from '../services/api';
import './SharedNote.css';

const SharedNote = () => {
  const { shareToken } = useParams();
  const [note, setNote] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchSharedNote();
  }, [shareToken]);

  const fetchSharedNote = async () => {
    try {
      setLoading(true);
      const response = await api.get(`/share/${shareToken}`);
      setNote(response.data.note);
      setError('');
    } catch (error) {
      setError(error.response?.data?.error || 'Failed to load shared note');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="loading">Loading shared note...</div>;
  }

  if (error || !note) {
    return (
      <div className="shared-note-container">
        <div className="shared-note-card">
          <h2>Note Not Available</h2>
          <p>{error || 'This shared note could not be found or the link has expired.'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="shared-note-container">
      <div className="shared-note-header">
        <h1>Shared Note</h1>
        <p className="read-only-badge">Read Only</p>
      </div>
      <div className="shared-note-card">
        <h2>{note.title}</h2>
        <div className="shared-note-meta">
          <span>By: {note.owner_username}</span>
          <span>Updated: {new Date(note.updated_at).toLocaleString()}</span>
        </div>
        <div className="shared-note-content">
          {note.content ? (
            <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>{note.content}</pre>
          ) : (
            <p className="empty-content">No content</p>
          )}
        </div>
      </div>
    </div>
  );
};

export default SharedNote;


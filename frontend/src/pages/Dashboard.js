import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import api from '../services/api';
import './Dashboard.css';

const Dashboard = () => {
  const [notes, setNotes] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const searchTimeoutRef = useRef(null);

  const fetchNotes = useCallback(async () => {
    try {
      setLoading(true);
      const response = await api.get('/notes');
      setNotes(response.data.notes);
      setError('');
    } catch (error) {
      setError('Failed to fetch notes');
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, []);

  const searchNotes = useCallback(async (query) => {
    if (!query || !query.trim()) {
      await fetchNotes();
      return;
    }

    try {
      setLoading(true);
      const response = await api.get(`/notes/search/query?q=${encodeURIComponent(query.trim())}`);
      setNotes(response.data.notes);
      setError('');
    } catch (error) {
      setError('Search failed');
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, [fetchNotes]);

  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    searchTimeoutRef.current = setTimeout(() => {
      searchNotes(searchQuery);
    }, 300);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchQuery, searchNotes]);

  const handleCreateNote = async () => {
    try {
      const response = await api.post('/notes', {
        title: 'Untitled Note',
        content: ''
      });
      navigate(`/note/${response.data.note.id}`);
    } catch (error) {
      setError('Failed to create note');
      console.error(error);
    }
  };

  const handleDeleteNote = async (noteId, e) => {
    e.stopPropagation();
    if (!window.confirm('Are you sure you want to delete this note?')) {
      return;
    }

    try {
      await api.delete(`/notes/${noteId}`);
      setNotes(notes.filter(note => note.id !== noteId));
    } catch (error) {
      setError('Failed to delete note');
      console.error(error);
    }
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div>
      <Navbar />
      <div className="container">
        <div className="dashboard-header">
          <h1>My Notes</h1>
          <button onClick={handleCreateNote} className="btn btn-primary">
            + New Note
          </button>
        </div>

        <div className="search-container">
          <input
            type="text"
            placeholder="Search notes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="search-input"
          />
        </div>

        {error && <div className="error-message">{error}</div>}

        {loading ? (
          <div className="loading">Loading notes...</div>
        ) : notes.length === 0 ? (
          <div className="empty-state">
            <p>No notes found. Create your first note!</p>
          </div>
        ) : (
          <div className="notes-grid">
            {notes.map(note => (
              <div
                key={note.id}
                className="note-card"
                onClick={() => navigate(`/note/${note.id}`)}
              >
                <div className="note-card-header">
                  <h3>{note.title || 'Untitled'}</h3>
                  <button
                    onClick={(e) => handleDeleteNote(note.id, e)}
                    className="btn-delete"
                    title="Delete note"
                  >
                    ×
                  </button>
                </div>
                <p className="note-preview">
                  {note.content ? (note.content.length > 100 ? note.content.substring(0, 100) + '...' : note.content) : 'No content'}
                </p>
                <div className="note-meta">
                  <span>Owner: {note.owner_username}</span>
                  <span>Updated: {formatDate(note.updated_at)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;

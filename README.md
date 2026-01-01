# Real-Time Collaborative Notes Application

A full-stack web application that enables multiple users to create, edit, and collaborate on notes in real time, with proper authentication, access control, and activity logging.

## Features

- **Authentication & Authorization**: User registration, login, JWT-based sessions, role-based access (Admin, Editor, Viewer)
- **Notes Management**: Create, edit, delete notes with ownership and timestamps
- **Real-Time Collaboration**: Live syncing using WebSockets (Socket.io)
- **Collaborator Management**: Add and remove collaborators with role-based permissions
- **Activity Logging**: Track user actions with timestamps and note references
- **Search Functionality**: Search note titles and content
- **Shareable Read-Only Links**: Public view-only access without login

## Tech Stack

### Backend
- Node.js with Express
- MySQL database
- JWT for authentication
- Socket.io for real-time communication
- bcryptjs for password hashing

### Frontend
- React (JavaScript)
- React Router for navigation
- Axios for API calls
- Socket.io-client for real-time updates

## Project Structure

```
.
├── backend/
│   ├── config/
│   │   └── database.js          # Database connection and initialization
│   ├── middleware/
│   │   ├── auth.js              # JWT authentication middleware
│   │   └── noteAccess.js        # Note access control middleware
│   ├── routes/
│   │   ├── auth.js              # Authentication routes
│   │   ├── notes.js             # Notes CRUD routes
│   │   ├── activity.js          # Activity log routes
│   │   └── share.js             # Share link routes
│   ├── socket/
│   │   └── socketHandlers.js    # WebSocket event handlers
│   ├── utils/
│   │   └── activityLogger.js    # Activity logging utility
│   ├── server.js                # Express server setup
│   └── package.json
├── frontend/
│   ├── public/
│   ├── src/
│   │   ├── components/          # Reusable components
│   │   ├── context/             # React context providers
│   │   ├── pages/               # Page components
│   │   ├── services/            # API service
│   │   ├── App.js
│   │   └── index.js
│   └── package.json
└── README.md
```

## Database Schema

### Users Table
```sql
CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  role VARCHAR(20) DEFAULT 'Viewer',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT chk_role CHECK (role IN ('Admin', 'Editor', 'Viewer'))
);
```

### Notes Table
```sql
CREATE TABLE notes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  content TEXT,
  owner_id INT NOT NULL,
  share_token VARCHAR(100) UNIQUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
);
```

### Note Collaborators Table
```sql
CREATE TABLE note_collaborators (
  id INT AUTO_INCREMENT PRIMARY KEY,
  note_id INT NOT NULL,
  user_id INT NOT NULL,
  role VARCHAR(20) DEFAULT 'Viewer',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_collab_role CHECK (role IN ('Editor', 'Viewer')),
  FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY unique_collaborator (note_id, user_id)
);
```

### Activity Logs Table
```sql
CREATE TABLE activity_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT,
  note_id INT,
  action VARCHAR(50) NOT NULL,
  details JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
);
```

## Setup Instructions

### Prerequisites
- Node.js (v14 or higher)
- MySQL (v8.0 or higher) or MySQL Workbench
- npm or yarn

### Backend Setup

1. Navigate to the backend directory:
```bash
cd backend
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file in the backend directory:
```env
PORT=5000
DB_HOST=localhost
DB_PORT=3306
DB_NAME=collaborative_notes
DB_USER=root
DB_PASSWORD=your_mysql_password
JWT_SECRET=your_super_secret_jwt_key_change_this_in_production
JWT_EXPIRES_IN=7d
NODE_ENV=development
FRONTEND_URL=http://localhost:3000
```

4. Create the MySQL database:
   - Open MySQL Workbench
   - Create a new schema named `collaborative_notes`
   - Or use command line: `mysql -u root -p` then `CREATE DATABASE collaborative_notes;`

5. Start the backend server:
```bash
npm start
```

For development with auto-reload:
```bash
npm run dev
```

The backend server will run on `http://localhost:5000`

### Frontend Setup

1. Navigate to the frontend directory:
```bash
cd frontend
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file in the frontend directory (optional):
```env
REACT_APP_API_URL=http://localhost:5000
```

4. Start the development server:
```bash
npm start
```

The frontend will run on `http://localhost:3000`

## API Documentation

### Authentication Endpoints

#### Register User
```
POST /api/auth/register
Body: {
  username: string,
  email: string,
  password: string,
  role?: 'Admin' | 'Editor' | 'Viewer'
}
Response: { token, user }
```

#### Login
```
POST /api/auth/login
Body: {
  email: string,
  password: string
}
Response: { token, user }
```

#### Get Current User
```
GET /api/auth/me
Headers: { Authorization: Bearer <token> }
Response: { user }
```

### Notes Endpoints

#### Get All Notes
```
GET /api/notes
Headers: { Authorization: Bearer <token> }
Response: { notes: [] }
```

#### Get Note by ID
```
GET /api/notes/:noteId
Headers: { Authorization: Bearer <token> }
Response: { note }
```

#### Create Note
```
POST /api/notes
Headers: { Authorization: Bearer <token> }
Body: {
  title: string,
  content?: string
}
Response: { note }
```

#### Update Note
```
PUT /api/notes/:noteId
Headers: { Authorization: Bearer <token> }
Body: {
  title?: string,
  content?: string
}
Response: { note }
```

#### Delete Note
```
DELETE /api/notes/:noteId
Headers: { Authorization: Bearer <token> }
Response: { message }
```

#### Add Collaborator
```
POST /api/notes/:noteId/collaborators
Headers: { Authorization: Bearer <token> }
Body: {
  email: string,
  role: 'Editor' | 'Viewer'
}
Response: { collaborator }
```

#### Remove Collaborator
```
DELETE /api/notes/:noteId/collaborators/:userId
Headers: { Authorization: Bearer <token> }
Response: { message }
```

#### Search Notes
```
GET /api/notes/search/query?q=<search_term>
Headers: { Authorization: Bearer <token> }
Response: { notes: [] }
```

### Activity Endpoints

#### Get Activity Logs
```
GET /api/activity?noteId=<noteId>&limit=<limit>
Headers: { Authorization: Bearer <token> }
Response: { activities: [] }
```

#### Get Note Activity Logs
```
GET /api/activity/note/:noteId
Headers: { Authorization: Bearer <token> }
Response: { activities: [] }
```

### Share Endpoints

#### Generate Share Link
```
POST /api/share/:noteId/generate
Headers: { Authorization: Bearer <token> }
Response: { shareToken, shareUrl }
```

#### Revoke Share Link
```
DELETE /api/share/:noteId/revoke
Headers: { Authorization: Bearer <token> }
Response: { message }
```

#### Get Shared Note
```
GET /api/share/:shareToken
Response: { note }
```

## WebSocket Events

### Client to Server

- `join-note`: Join a note room for real-time updates
  ```javascript
  socket.emit('join-note', noteId)
  ```

- `leave-note`: Leave a note room
  ```javascript
  socket.emit('leave-note', noteId)
  ```

- `note-update`: Update note content in real-time
  ```javascript
  socket.emit('note-update', { noteId, title, content })
  ```

- `typing`: Indicate user is typing
  ```javascript
  socket.emit('typing', { noteId })
  ```

### Server to Client

- `joined-note`: Confirmation of joining note room
- `note-updated`: Broadcast note update to other users
- `user-joined`: Notification when user joins
- `user-left`: Notification when user leaves
- `user-typing`: Notification when user is typing
- `error`: Error message

## Role-Based Access Control

### Admin
- Full access to all features
- Can manage users and notes

### Editor
- Can create, edit, and delete own notes
- Can edit notes shared with Editor role
- Can add/remove collaborators

### Viewer
- Can view own notes and shared notes
- Cannot edit or delete notes
- Read-only access

## Security Features

- Password hashing with bcryptjs
- JWT token-based authentication
- Role-based access control
- Note ownership validation
- Collaborator permission checks
- SQL injection prevention with parameterized queries
- CORS configuration

## Development Notes

- The database tables are automatically created on first server start
- JWT tokens expire after 7 days (configurable)
- Real-time updates use Socket.io rooms for efficient broadcasting
- Activity logs are stored as JSON for flexible details storage
- Search uses MySQL LIKE for case-insensitive matching

## License

ISC


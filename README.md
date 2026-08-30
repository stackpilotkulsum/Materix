# Materix

Materix is a secure material and candidate resume management web application built with React and Node.js. It allows users to register, sign in (locally or via Google OAuth), upload study/recruitment materials, extract resume bio & candidate information, search file history, share materials with friends via live chat, and manage account security.

## Project Overview

Materix provides a safe, organized workspace for material files. The app enforces file validation, blocks malware/executable binaries, anonymizes filenames using UUIDs, extracts resume data (education, skills, experience, contact details), and operates in **Local Storage Mode** with zero external database dependencies.

## Key Features

- **Authentication**: Local username/password registration & login, plus Google OAuth sign-in.
- **JWT Protection**: Secure 24-hour JWT tokens with automatic inactivity session timeouts.
- **Material Upload Zone**: Single file or full folder drag-and-drop uploads.
- **Supported Formats**: PDF, DOCX, TXT, ZIP, and Images (PNG, JPG, WEBP, GIF, SVG, BMP).
- **ZIP Extraction**: Automated extraction of valid documents inside uploaded ZIP archives.
- **Security Inspection**: Magic bytes binary check blocking executable binaries (MZ/ELF).
- **Resume Extraction**: Automated extraction of candidate name, contact details, skills, experience, education, projects, and certifications from resumes.
- **File History & Search**: Instant full-text search across filenames, candidate names, skills, and extracted text.
- **Friends & Live Chat**: Search users, send friend requests, accept/decline requests, and send direct messages and file attachments.
- **Local Storage Architecture**: All data stored locally on disk (`server/uploads/`) and structured JSON databases (`users.json`, `metadata.json`, `friends.json`, `messages.json`).

## Application URLs

- **GitHub Repository**: [https://github.com/stackpilotkulsum/Materix](https://github.com/stackpilotkulsum/Materix)
- **Frontend App**: `http://localhost:5173`
- **Backend API**: `http://localhost:5000`

---

## Installation and Setup

### Prerequisites
- Node.js (v18+)
- npm
- Git

### 1. Clone the Repository
```bash
git clone https://github.com/stackpilotkulsum/Materix.git
cd Materix
```

### 2. Install & Start Backend
```bash
cd server
npm install
node server.js
```
*Backend runs on `http://localhost:5000`*

### 3. Install & Start Frontend
In a new terminal:
```bash
cd client
npm install
npm run dev
```
*Frontend runs on `http://localhost:5173`*

---

## API Documentation

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/` | Backend health check |
| `POST` | `/api/auth/register` | Register a new account |
| `POST` | `/api/auth/login` | Authenticate with username/password |
| `POST` | `/api/auth/google-login` | Authenticate via Google OAuth token |
| `POST` | `/api/auth/google-register` | Register via Google OAuth token |
| `POST` | `/api/upload` | Upload material files (PDF, DOCX, Images, ZIP) |
| `GET` | `/api/files` | Get user's uploaded materials & extracted data |
| `DELETE` | `/api/files/:id` | Delete a material file and its metadata |
| `POST` | `/api/files/reprocess` | Re-parse uploaded resumes |
| `GET` | `/api/friends/search` | Search users by username |
| `POST` | `/api/friends/request` | Send a friend request |
| `GET` | `/api/friends/requests` | Get pending incoming/outgoing friend requests |
| `POST` | `/api/friends/respond` | Accept or reject a friend request |
| `GET` | `/api/friends` | Get list of accepted friends |
| `GET` | `/api/chat/active-chats` | Get active chat conversations |
| `GET` | `/api/chat/messages/:friend` | Get chat history with a friend |
| `POST` | `/api/chat/messages` | Send a chat message |
| `POST` | `/api/chat/upload` | Upload a file attachment for chat |

---

## Author

Materix is developed by Kulsum Malik.
GitHub: [https://github.com/stackpilotkulsum/Materix](https://github.com/stackpilotkulsum/Materix)

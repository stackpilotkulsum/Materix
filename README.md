# Materix

Materix is a secure material/document management web app. It lets users create an account, sign in, upload study or recruitment materials, organize single files and folders, view upload history, search stored documents, and download or delete files when needed.

## Project Idea

The idea behind Materix is to provide a simple and safe place to upload and manage important material files. The app focuses on secure document handling by validating uploads, blocking unsupported or suspicious files, anonymizing stored file names with UUIDs, and keeping upload metadata separate from the original file names.

It is useful for managing PDFs, DOCX files, TXT documents, resumes, study notes, assignments, or image attachments.

## Features

- User registration and login with username/password
- Google login support through Supabase OAuth
- JWT-based protected API access
- Upload single files or complete folders
- Drag-and-drop upload UI
- Supported formats: PDF, DOCX, TXT, ZIP, and Images (PNG, JPG, WEBP, GIF, SVG, BMP)
- ZIP extraction for valid PDF/DOCX/TXT/Image files
- File size limit of 10 MB per file
- Empty-file and unsupported-file blocking
- Binary inspection to block executable files disguised as documents (e.g. MZ/ELF signatures)
- Upload rate limiting on the backend
- Upload history with interactive file cards
- Search by file name, folder, email, phone, or extracted summary
- Download uploaded files directly
- Delete uploaded files
- Security dashboard with file count and storage usage
- PDF/text parsing support for extracting email, phone, and summary-style content

## Tools and Technologies

### Frontend
- React
- Vite
- React Router DOM
- Axios
- Lucide React icons
- Supabase JavaScript client
- Custom premium styling (HSL tailored, dark overlays)

### Backend
- Node.js
- Express.js
- Multer for file uploads
- JWT for authentication
- bcryptjs for password hashing
- CORS
- dotenv
- adm-zip for ZIP processing
- pdf-parse for PDF text extraction

## Folder Structure

```text
Materix/
|-- client/
|   |-- public/
|   |   |-- favicon.svg
|   |   `-- icons.svg
|   |-- src/
|   |   |-- assets/
|   |   |   |-- hero.png
|   |   |   |-- react.svg
|   |   |   `-- vite.svg
|   |   |-- components/
|   |   |   |-- FileHistory.jsx
|   |   |   |-- Header.jsx
|   |   |   |-- Login.jsx
|   |   |   |-- Register.jsx
|   |   |   |-- Settings.jsx
|   |   |   `-- UploadZone.jsx
|   |   |-- api.js
|   |   |-- App.css
|   |   |-- App.jsx
|   |   |-- index.css
|   |   |-- main.jsx
|   |   `-- supabase.js
|   |-- eslint.config.js
|   |-- index.html
|   |-- package.json
|   `-- vite.config.js
|-- server/
|   |-- server.js
|   |-- users.json
|   |-- package.json
|   `-- package-lock.json
|-- GOOGLE_OAUTH_SETUP.md
|-- package-lock.json
|-- script.js
|-- style.css
|-- test.pdf
`-- README.md
```

## Installation and Setup

### Prerequisites
Install these before running the project:
- Node.js
- npm
- Git

### 1. Clone the Repository
```bash
git clone https://github.com/stackpilotkulsum/Materix.git
cd Materix
```

### 2. Install Backend Dependencies
```bash
cd server
npm install
```

### 3. Install Frontend Dependencies
Open a new terminal:
```bash
cd client
npm install
```

## Environment Variables

Create a `.env` file inside `server/`:
```env
PORT=5000
SUPABASE_URL=https://uhtdwatcfiqzrzcpzmf.supabase.co
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_KEY=your_supabase_service_role_key
FRONTEND_URL=http://localhost:5173
SESSION_SECRET=your_jwt_session_secret
```

Create a `.env` file inside `client/`:
```env
VITE_API_URL=http://localhost:5000
VITE_SUPABASE_URL=https://uhtdwatcfiqzrzcpzmf.supabase.co
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
VITE_AUTH_REDIRECT_URL=http://localhost:5173
```

## Run the Project Locally

### Start the Backend
From the `server/` folder:
```bash
npm start
```
The backend runs on: `http://localhost:5000`

### Start the Frontend
From the `client/` folder:
```bash
npm run dev
```
The frontend runs on: `http://localhost:5173`

## API Routes

| Method | Route | Description |
| --- | --- | --- |
| `GET` | `/` | Backend health message |
| `POST` | `/api/auth/register` | Register a new user |
| `POST` | `/api/auth/login` | Login with username and password |
| `POST` | `/api/auth/supabase-login` | Exchange Supabase session for app JWT |
| `POST` | `/api/auth/google-login` | Login using Google credential |
| `POST` | `/api/auth/google-register` | Register using Google credential |
| `POST` | `/api/upload` | Upload protected study/material files |
| `GET` | `/api/files` | Get authenticated user's uploaded files |
| `DELETE` | `/api/files/:id` | Delete an uploaded file |

## Author

Materix is developed by Kulsum Malik.

GitHub repository: <https://github.com/stackpilotkulsum/Materix>

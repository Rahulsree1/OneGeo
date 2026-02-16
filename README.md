# One Geo — LAS Well Log Analysis System

A full-stack application for uploading, storing, processing, and analyzing **LAS** (Log ASCII Standard) well log files. Upload LAS files, parse curves into the database, visualize them, run statistics, and get AI-powered interpretation—all in one place.

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Project Structure](#project-structure)
- [Features](#features)
- [Prerequisites](#prerequisites)
- [Setup](#setup)
- [Running the Application](#running-the-application)
- [API Reference](#api-reference)
- [Environment Variables](#environment-variables)
- [Deployment](#deployment)

---

## Overview

**One Geo** lets you:

- **Upload** LAS/LAS2 files via drag-and-drop or file picker; files are stored in **AWS S3** and metadata in **PostgreSQL**.
- **Process** files in the background: the backend parses LAS with **lasio**, extracts curves, and saves them to the database. Progress is streamed in real time over **WebSockets**.
- **Manage** files in a **File Manager**: filter by All / Processed / Unprocessed / Processing, search by file or well name, mark important, archive, soft-delete, or **permanently delete** (removes from S3 and DB; if the well has no files left, the well and its curves are removed too).
- **Open** any file in a **Dashboard** at `/dashboard` or `/dashboard/:fileId` for direct links and refresh-safe URLs.
- **Visualize** curves (depth vs value) with zoom, fit view, and curve selection in the **Analysis** tab.
- **View** deterministic **Statistics** and **AI Interpretation** (Groq LLM) and generate **Analysis & Reports** (PDF/Excel export).

Processing state is persisted in **sessionStorage**, so refreshing during processing keeps the same file in the “Processing” state and reconnects to live logs.

---

## Architecture

| Layer        | Technology |
|-------------|------------|
| **Frontend** | React 19, TypeScript, Vite, Tailwind CSS, React Router, Axios, Socket.IO client, Recharts, jsPDF, xlsx, Lucide icons |
| **Backend**  | Flask, Flask-SocketIO, **eventlet** (for WebSockets), SQLAlchemy, lasio, boto3, Groq (LLM) |
| **Database**| PostgreSQL (or Supabase) |
| **Storage**  | AWS S3 for raw LAS files |
| **Realtime**| WebSockets (Socket.IO) for processing progress and logs |

The backend runs with **eventlet** so that Socket.IO and long-running processing (e.g. curve inserts) work correctly without blocking. Run with `python app.py`; do not use `flask run`.

---

## Project Structure

```
One Geo/
├── backend/                    # Flask API + Socket.IO
│   ├── config/                 # App config, DB URL (Supabase or PostgreSQL)
│   ├── controllers/            # HTTP handlers (files, wells, visualization, AI)
│   ├── dao/                    # Data access (File, Well, Curve)
│   ├── models/                 # SQLAlchemy models (File, Well, Curve)
│   ├── routes/                 # Blueprint routes under /api
│   ├── services/               # Business logic (upload, process, LAS parsing)
│   ├── utils/                  # S3 helpers, error handler
│   ├── extensions.py           # SocketIO instance
│   ├── app.py                  # Entry point (eventlet + socketio.run)
│   └── requirements.txt
│
├── frontend/                   # React SPA (Vite)
│   ├── src/
│   │   ├── api/                # API client (files, wells, visualization, AI, download)
│   │   ├── components/         # Analysis, Statistics, AIInterpretation, Reports
│   │   ├── context/            # ProcessingContext (global processing state + sessionStorage)
│   │   ├── hooks/              # useProcessLogs (Socket.IO), useWellMeta
│   │   ├── pages/              # FileManager, Dashboard
│   │   ├── App.tsx             # Routes: /, /dashboard, /dashboard/:fileId
│   │   └── main.tsx
│   ├── index.html
│   ├── package.json
│   └── vite.config.ts
│
├── .env.example                # Environment template (root or backend)
└── README.md
```

---

## Features

### File Manager (`/`)

- **Tabs**: All, Processed, Unprocessed, Processing (active job).
- **Upload**: Modal with drag-and-drop; optional “Process automatically after upload” (upload finishes first, then processing runs in background). Duplicate file names get a suffix (e.g. `well (1).las`).
- **Search**: Highlights matches in file and well names.
- **Actions per file**: Process, Download, Mark important, Archive, Delete (soft), Restore, Permanently delete. Buttons are always visible (no hover-only).
- **Processing**: Per-file progress % and expandable live logs; state survives refresh via sessionStorage and reconnects to Socket.IO.
- **Bulk actions**: Select multiple files for archive, delete, or permanent delete.
- **Tooltips** on main actions.

### Dashboard (`/dashboard`, `/dashboard/:fileId`)

- **URL**: Open a specific file with `/dashboard/:fileId`; the file is loaded from the API on load/refresh so links work when shared or after reload.
- **Tabs**: Visualization (curve charts), Statistics, AI Interpretation, Analysis & Reports.
- **Processing**: If the file is not yet processed, a “Process this file” button and (when running) progress bar + live logs. When processing finishes, the UI switches to the Visualization tab.
- **No blank screen**: Loading and “file not found” states are handled; minimum heights keep layout stable.

### Backend behavior

- **Upload (upload-only)**: Parses LAS header to get well name, creates/gets that well, uploads file to S3, creates file record (unprocessed). One well per LAS from the start.
- **Process**: Downloads from S3, parses LAS, creates/updates well and curves, marks file processed. If the file was on an empty “Unprocessed” well, that well is removed.
- **Permanent delete**: Removes file from S3 and deletes the file row. If the well has **no files left**, deletes all curves for that well and then the well row.

---

## Prerequisites

- **Python 3.10+**
- **Node.js 18+**
- **PostgreSQL 14+** (or a Supabase project)
- **AWS account** (S3 bucket; IAM credentials with `s3:PutObject`, `s3:GetObject`, `s3:DeleteObject`)
- **Groq API key** (optional; for AI Interpretation tab)

---

## Setup

### 1. Clone and environment

```bash
cd "One Geo"
```

Copy the environment template and edit as needed (see [Environment Variables](#environment-variables)):

```bash
cp .env.example .env
# Edit .env (backend/ or project root)
```

### 2. Database

Create a PostgreSQL database (if not using Supabase):

```sql
CREATE DATABASE las_well_logs;
```

For **Supabase**, use the connection string from **Project Settings → Database** (Transaction pooler or Direct). Put it in `.env` as `DATABASE_URL`.

### 3. Backend

```bash
cd backend
python -m venv venv
# Windows:
venv\Scripts\activate
# macOS/Linux:
# source venv/bin/activate

pip install -r requirements.txt
```

Configure `.env` (see below). Create the S3 bucket and set IAM permissions for the app.

Tables are created automatically on first run (`db.create_all()` in `app.py`).

### 4. Frontend

```bash
cd frontend
npm install
```

Optional: create `frontend/.env` and set `VITE_API_URL` to your backend URL (default is `http://localhost:1729`).

---

## Running the Application

### Option A: Single server (frontend served from backend)

Build the frontend once, then run only the backend. The backend serves the built SPA and the API from the same origin (no CORS, one port).

```bash
# 1. Build frontend (uses .env.production with VITE_API_URL= for same-origin)
cd frontend
npm run build
cd ..

# 2. Run backend (serves API + static files from frontend/dist)
cd backend
python app.py
```

- Open **http://localhost:1729** in your browser. The app, API, and WebSockets all use this URL.

If `frontend/dist` does not exist, the backend still runs but only the API is available; add the SPA routes after building the frontend.

### Option B: Separate dev servers

**Backend** (must use `python app.py` for Socket.IO + eventlet):

```bash
cd backend
python app.py
```

- API: **http://localhost:1729**
- Socket.IO uses the same host/port.

**Frontend**:

```bash
cd frontend
npm run dev
```

- App: **http://localhost:5173** (Vite default). The dev server proxies or uses `VITE_API_URL=http://localhost:1729` so the app talks to the backend.

Open the app, upload a LAS file, optionally start processing, then open the file in the Dashboard to view Visualization, Statistics, AI Interpretation, and Reports.

---

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/files/upload` | Upload LAS file (optional `?process=true` for immediate process) |
| GET | `/api/files` | List files (optional `?status=`, `?important=1`) |
| GET | `/api/files/<id>/download` | Get signed download URL |
| PATCH | `/api/files/<id>` | Update file (status, is_important) |
| DELETE | `/api/files/<id>` | Permanently delete file (S3 + DB; well removed if empty) |
| POST | `/api/files/<id>/process` | Start background processing |
| PATCH | `/api/files/bulk` | Bulk update (body: `file_ids`, `status`, `is_important`) |
| POST | `/api/files/bulk-delete` | Permanently delete multiple files (body: `file_ids`) |
| GET | `/api/wells` | List wells |
| GET | `/api/wells/<id>` | Get well |
| GET | `/api/wells/<id>/curves` | Get curve names for well |
| GET | `/api/wells/<id>/depth-range` | Get depth min/max |
| POST | `/api/visualization` | Get curve data (body: well_id, curve_names, depth_min, depth_max) |
| POST | `/api/ai/interpret` | Deterministic interpretation |
| POST | `/api/ai/interpret-llm` | LLM interpretation (Groq) |

**WebSocket (Socket.IO)**  
- Event `process_log`: payload `{ file_id, message, step?, inserted?, total? }` for processing progress and logs.

---

## Environment Variables

Place these in `.env` in the **project root** or **backend** directory.

| Variable | Description |
|----------|-------------|
| `FLASK_ENV` | `development` or `production` |
| `FLASK_DEBUG` | `true` / `false` |
| `SECRET_KEY` | Flask secret (use a strong value in production) |
| `DATABASE_URL` | PostgreSQL URI (Supabase or local). Preferred over separate DB_* vars. |
| `DB_USER`, `DB_PASSWORD`, `DB_HOST`, `DB_PORT`, `DB_NAME` | Alternative to `DATABASE_URL` for local PostgreSQL |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `S3_BUCKET_NAME` | S3 credentials and bucket |
| `GROQ_API_KEY` | Optional; for AI Interpretation (LLM) |

**Frontend** (optional, in `frontend/.env` or `frontend/.env.production`):

| Variable | Description |
|----------|-------------|
| `VITE_API_URL` | Backend URL for API and Socket.IO. Default in code: `http://localhost:1729`. For **single-server** (frontend served from backend), use empty `VITE_API_URL=` (set in `frontend/.env.production` so `npm run build` uses same origin). |

---

## Deployment

### Backend

Run with Gunicorn + eventlet workers so Socket.IO and long requests work:

```bash
pip install gunicorn
gunicorn -k eventlet -w 1 -b 0.0.0.0:1729 "app:app"
```

(Single worker is typical for Socket.IO; scale with a sticky session / adapter if needed.)

Set `FLASK_ENV=production`, `FLASK_DEBUG=false`, and a strong `SECRET_KEY`. Configure CORS in `app.py` for your frontend origin.

### Frontend (single server)

To serve the frontend from the backend (recommended for simple deployment):

1. Build: `cd frontend && npm run build` (uses `frontend/.env.production` with `VITE_API_URL=` for same origin).
2. Run the backend from the `backend/` directory; it will serve `frontend/dist` at the same host/port as the API (e.g. **http://localhost:1729**).

### Frontend (separate static host)

To serve the frontend from nginx or another static host:

```bash
cd frontend
npm run build
```

Serve the `dist/` folder and set `VITE_API_URL` to your backend URL **before** building so the client points to the right API and WebSocket server.

---

## License

Use and modify as needed for your project.

# Synapse YT Companion

A dashboard for YouTube creators to manage their uploaded videos — edit metadata, manage comments, jot down notes, and get AI-powered title suggestions. Built for the Cactro backend exam.

**Live Demo:** https://synapse-yt-companion-app.vercel.app  
**Backend API:** https://synapse-yt-companion-app.onrender.com

---

## What it does

You connect your YouTube channel via Google OAuth and get a workspace for each of your videos with three tabs:

- **Editor** — Get 3 AI-generated viral title suggestions based on your current title. Click one to prefill the form, then save it directly to YouTube.
- **Comments** — See all comments on your video, post new ones, reply to existing ones, and delete your own.
- **Notes** — A private scratchpad tied to each video. Add notes with titles, content, and tags. Search by keyword or filter by tag.

Everything is logged to an event log so you can see a history of all actions taken.

---

## Tech Stack

| Part | Technology |
|---|---|
| Backend | FastAPI (Python) |
| Frontend | Next.js 14 (App Router) |
| Database | Neon (PostgreSQL) |
| ORM + Migrations | SQLAlchemy + Alembic |
| Auth | Google OAuth 2.0 |
| YouTube Integration | Google YouTube Data API v3 |
| AI | Groq API (Llama 3.3 70B) |
| Deployment | Render (backend) + Vercel (frontend) |

---

## Strategy

The core challenge was OAuth. Most tutorials pass only the `access_token` to the frontend and call it done — but the Google client library needs the full credential set (`refresh_token`, `client_id`, `client_secret`, `token_uri`) to make API calls and auto-refresh expired tokens. The solution was to store the complete credentials server-side in a `user_sessions` table, keyed by `access_token`. The frontend only ever sees and stores the `access_token` — secrets never leave the backend.

For AI title generation, the original plan was Gemini but it hit quota limits immediately. Switched to Groq's free tier (14,400 requests/day) which is more than enough and has no cold start issues.

Tag search on notes uses Python-side filtering instead of SQL. The `tags` column is stored as JSON, and PostgreSQL's JSON type doesn't support the `LIKE` operator (you'd need JSONB with the `@>` operator for that). For this scale, filtering after fetching from DB is perfectly fast and avoids a schema migration.

---

## Database Schema

```
user_sessions
  id, access_token, refresh_token, token_uri, 
  client_id, client_secret, scopes, created_at

notes
  id, video_id, title, content, tags (JSON), 
  created_at, updated_at

comments
  id, video_id, youtube_comment_id, parent_youtube_id, 
  text, created_at

logs
  id, action, details, timestamp
```

Migrations are managed with Alembic. Run `alembic upgrade head` before starting the server.

---

## API Endpoints

### Auth
| Method | Endpoint | Description |
|---|---|---|
| GET | `/login` | Redirects to Google OAuth consent screen |
| GET | `/auth/callback` | Handles OAuth redirect, stores credentials, returns token |
| POST | `/logout` | Revokes token, deletes session |

### Videos
| Method | Endpoint | Description |
|---|---|---|
| GET | `/videos` | Lists all uploaded videos from the user's channel |
| GET | `/videos/{video_id}` | Gets full details for a single video |
| PUT | `/videos/{video_id}/metadata` | Updates title and description on YouTube |

### Comments
| Method | Endpoint | Description |
|---|---|---|
| GET | `/videos/{video_id}/comments` | Fetches all comments + replies from YouTube |
| GET | `/videos/{video_id}/comments/local` | Returns comments posted via this app (for delete eligibility) |
| POST | `/videos/{video_id}/comments` | Posts a comment or reply (set `parent_id` for replies) |
| DELETE | `/comments/{comment_id}` | Deletes from YouTube and local DB |

### Notes
| Method | Endpoint | Description |
|---|---|---|
| GET | `/videos/{video_id}/notes` | Lists notes. Optional `?search=` and `?tag=` filters |
| POST | `/videos/{video_id}/notes` | Creates a note |
| PUT | `/notes/{note_id}` | Updates a note |
| DELETE | `/notes/{note_id}` | Deletes a note |

### AI & Logs
| Method | Endpoint | Description |
|---|---|---|
| POST | `/videos/{video_id}/suggestions` | Returns 3 AI-generated title suggestions |
| GET | `/logs` | Returns recent event logs |

---

## Running locally

**Backend:**
```bash
cd backend
cp .env.example .env   # fill in your credentials
uv run main.py
```

**Frontend:**
```bash
cd frontend
cp .env.example .env.local   # set NEXT_PUBLIC_API_URL=http://127.0.0.1:8000
npm install
npm run dev
```

**Environment variables needed:**
```
DATABASE_URL=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GROQ_API_KEY=
```

---

## AI Usage

AI was used throughout this project for code generation (FastAPI routes, Next.js components, SQLAlchemy models). Architecture decisions, stack selection, API setup, Google Cloud Console configuration, and deployment were done manually. All code was reviewed and understood before being used.
```

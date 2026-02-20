import os
import requests
from fastapi import FastAPI, Depends, Request, HTTPException, Header, Body
from fastapi.responses import RedirectResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from google_auth_oauthlib.flow import Flow
from google.oauth2.credentials import Credentials
from typing import Optional, List

from app import database, models, schemas
from app.youtube_api import (
    list_my_videos,
    get_youtube_client,
    fetch_video_details,
    update_video_info,
    fetch_video_comments,
    post_comment,
    reply_to_comment,
    delete_comment,
)
from app.ai_service import generate_viral_titles

# ── App setup ──────────────────────────────────────────────────────────────────

app = FastAPI(title="YouTube Companion API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "https://your-vercel-url.vercel.app"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# NOTE: DB schema is managed by Alembic migrations.
# Run 'alembic upgrade head' before starting the server.
# Never use create_all() in production.


# ── Constants ──────────────────────────────────────────────────────────────────

REDIRECT_URI = "REDIRECT_URI = "https://your-render-url.onrender.com/auth/callback"
SCOPES = [
    "https://www.googleapis.com/auth/youtube.force-ssl",
]


# ── Helpers ────────────────────────────────────────────────────────────────────

def log_event(db: Session, action: str, details: str):
    """Convenience function to write an event log row."""
    entry = models.EventLog(action=action, details=details)
    db.add(entry)
    db.commit()


def get_token_from_header(authorization: Optional[str] = Header(None)) -> str:
    """
    Extracts Bearer token from the Authorization header.
    Frontend must send:  Authorization: Bearer <token>
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header.")
    return authorization.split("Bearer ")[1].strip()


def get_youtube_from_db(token: str, db: Session):
    """
    Loads full OAuth credentials from DB and returns a ready YouTube client.
    Raises 401 if the token is not found (user needs to log in again).
    """
    session = db.query(models.UserSession).filter(
        models.UserSession.access_token == token
    ).first()
    if not session:
        raise HTTPException(
            status_code=401,
            detail="Session not found. Please log in again via /login."
        )
    return get_youtube_client({
        "access_token": session.access_token,
        "refresh_token": session.refresh_token,
        "token_uri": session.token_uri,
        "client_id": session.client_id,
        "client_secret": session.client_secret,
        "scopes": session.scopes,
    })


def build_flow():
    return Flow.from_client_config(
        {
            "web": {
                "client_id": os.getenv("GOOGLE_CLIENT_ID"),
                "client_secret": os.getenv("GOOGLE_CLIENT_SECRET"),
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
            }
        },
        scopes=SCOPES,
        redirect_uri=REDIRECT_URI,
    )


# ── Auth Routes ────────────────────────────────────────────────────────────────

@app.get("/login", tags=["Auth"])
def login():
    """Redirects the user to Google's OAuth consent screen."""
    flow = build_flow()
    auth_url, _ = flow.authorization_url(prompt="consent", access_type="offline")
    return RedirectResponse(auth_url)


@app.get("/auth/callback", tags=["Auth"])
async def auth_callback(request: Request, db: Session = Depends(database.get_db)):
    """
    Google redirects here after the user grants permission.
    We pass the token back to the frontend via a redirect.
    """
    code = request.query_params.get("code")
    if not code:
        raise HTTPException(status_code=400, detail="Missing code from Google callback.")

    flow = build_flow()
    flow.fetch_token(code=code)
    creds = flow.credentials

    # Store FULL credentials in DB keyed by access_token.
    # Credentials(token=only) cannot refresh itself — it needs refresh_token,
    # client_id, client_secret, and token_uri. We keep secrets server-side.
    existing = db.query(models.UserSession).filter(
        models.UserSession.access_token == creds.token
    ).first()
    if not existing:
        session = models.UserSession(
            access_token=creds.token,
            refresh_token=creds.refresh_token,
            token_uri=creds.token_uri,
            client_id=creds.client_id,
            client_secret=creds.client_secret,
            scopes=list(creds.scopes) if creds.scopes else [],
        )
        db.add(session)
        db.commit()

    log_event(db, "GOOGLE_LOGIN_SUCCESS", "User authenticated via Google OAuth.")

    # Only the access_token goes to the frontend — secrets stay in DB
    return RedirectResponse(url=f"http://localhost:3000/?token={creds.token}")


@app.post("/logout", tags=["Auth"])
def logout(authorization: str = Header(None), db: Session = Depends(database.get_db)):
    """Revokes the OAuth token with Google."""
    token = get_token_from_header(authorization)
    requests.post(
        f"https://oauth2.googleapis.com/revoke?token={token}",
        headers={"content-type": "application/x-www-form-urlencoded"},
    )
    # Clean up the stored session so the token can't be reused
    db.query(models.UserSession).filter(
        models.UserSession.access_token == token
    ).delete()
    db.commit()

    log_event(db, "LOGOUT", "User revoked OAuth token.")
    return {"message": "Logged out successfully."}


# ── Video Routes ───────────────────────────────────────────────────────────────

@app.get("/videos", tags=["Video"])
async def list_videos(
    authorization: Optional[str] = Header(None),
    db: Session = Depends(database.get_db),
):
    """Returns all videos uploaded by the authenticated user (their channel uploads)."""
    token = get_token_from_header(authorization)
    youtube = get_youtube_from_db(token, db)
    try:
        videos = list_my_videos(youtube)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"YouTube API error: {str(e)}")
    log_event(db, "VIDEOS_LISTED", f"Fetched {len(videos)} videos from channel.")
    return {"data": videos}


@app.get("/videos/{video_id}", tags=["Video"])
async def get_video(
    video_id: str,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(database.get_db),
):
    """
    Fetches full details (snippet + statistics) for a single video from YouTube.
    """
    token = get_token_from_header(authorization)
    youtube = get_youtube_from_db(token, db)

    video = fetch_video_details(youtube, video_id)
    if not video:
        raise HTTPException(status_code=404, detail=f"Video {video_id} not found on YouTube.")

    log_event(db, "VIDEO_FETCHED", f"Fetched details for video_id={video_id}")
    return {"data": video}


@app.put("/videos/{video_id}/metadata", tags=["Video"])
async def update_metadata(
    video_id: str,
    body: schemas.VideoMetadataUpdate,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(database.get_db),
):
    """
    Updates the video's title and description on YouTube AND saves to local DB.
    """
    token = get_token_from_header(authorization)
    youtube = get_youtube_from_db(token, db)

    # 1. Update on YouTube
    try:
        update_video_info(youtube, video_id, body.title, body.description)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"YouTube API error: {str(e)}")

    # 2. Mirror in local DB (upsert pattern)
    note = db.query(models.Note).filter(models.Note.video_id == video_id).first()
    if not note:
        note = models.Note(video_id=video_id)
        db.add(note)
    note.title = body.title
    db.commit()

    log_event(db, "VIDEO_METADATA_UPDATED", f"video_id={video_id} title='{body.title}'")
    return {"status": "success", "message": "Video title and description updated on YouTube."}


# ── AI Suggestions ─────────────────────────────────────────────────────────────

@app.post("/videos/{video_id}/suggestions", tags=["AI"])
async def get_ai_suggestions(
    video_id: str,
    data: dict = Body(...),
    db: Session = Depends(database.get_db),
):
    """
    Uses Gemini to suggest 3 improved titles based on the current title.
    No YouTube token needed — this is purely AI.
    """
    current_title = data.get("title", "YouTube Video")
    titles = await generate_viral_titles(current_title)
    log_event(db, "AI_SUGGESTIONS_GENERATED", f"video_id={video_id} base_title='{current_title}'")
    return {"suggestions": titles}


# ── Comment Routes ─────────────────────────────────────────────────────────────

@app.get("/videos/{video_id}/comments", tags=["Comments"])
async def get_comments(
    video_id: str,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(database.get_db),
):
    """Fetches all top-level comments + replies from YouTube for this video."""
    token = get_token_from_header(authorization)
    youtube = get_youtube_from_db(token, db)

    try:
        comments = fetch_video_comments(youtube, video_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"YouTube API error: {str(e)}")

    log_event(db, "COMMENTS_FETCHED", f"video_id={video_id}")
    return {"data": comments}


@app.post("/videos/{video_id}/comments", tags=["Comments"], response_model=schemas.CommentResponse)
async def add_comment(
    video_id: str,
    body: schemas.CommentCreate,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(database.get_db),
):
    """
    Posts a new top-level comment OR a reply (if parent_id is provided).
    Saves to local DB so we can track our own comments for deletion later.
    """
    token = get_token_from_header(authorization)
    youtube = get_youtube_from_db(token, db)

    try:
        if body.parent_id:
            # It's a reply to an existing comment
            yt_comment_id = reply_to_comment(youtube, body.parent_id, body.text)
        else:
            # It's a new top-level comment
            yt_comment_id = post_comment(youtube, video_id, body.text)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"YouTube API error: {str(e)}")

    # Save to local DB
    new_comment = models.Comment(
        video_id=video_id,
        youtube_comment_id=yt_comment_id,
        parent_youtube_id=body.parent_id,
        text=body.text,
    )
    db.add(new_comment)
    db.commit()
    db.refresh(new_comment)

    action = "REPLY_POSTED" if body.parent_id else "COMMENT_POSTED"
    log_event(db, action, f"video_id={video_id} yt_comment_id={yt_comment_id}")

    return new_comment


@app.delete("/comments/{comment_id}", tags=["Comments"])
async def remove_comment(
    comment_id: int,
    authorization: Optional[str] = Header(None),
    db: Session = Depends(database.get_db),
):
    """
    Deletes a comment from YouTube AND from local DB.
    comment_id here is our internal DB id (integer).
    """
    token = get_token_from_header(authorization)
    youtube = get_youtube_from_db(token, db)

    # Find our local record to get the YouTube comment ID
    comment = db.query(models.Comment).filter(models.Comment.id == comment_id).first()
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found in local DB.")

    # Delete from YouTube
    try:
        delete_comment(youtube, comment.youtube_comment_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"YouTube API error: {str(e)}")

    # Delete from local DB
    yt_id = comment.youtube_comment_id
    db.delete(comment)
    db.commit()

    log_event(db, "COMMENT_DELETED", f"yt_comment_id={yt_id}")
    return {"status": "success", "message": "Comment deleted from YouTube and local DB."}


# ── Notes Routes ───────────────────────────────────────────────────────────────

@app.get("/videos/{video_id}/notes", tags=["Notes"], response_model=List[schemas.NoteResponse])
def get_notes(
    video_id: str,
    search: Optional[str] = None,
    tag: Optional[str] = None,
    db: Session = Depends(database.get_db),
):
    """
    Returns all notes for a video.
    Optional filters:
      ?search=keyword   — searches title + content (case-insensitive)
      ?tag=mytag        — filters by tag (Python-side, avoids JSON operator issues)
    """
    query = db.query(models.Note).filter(models.Note.video_id == video_id)

    if search:
        # Search across both title and content
        query = query.filter(
            models.Note.content.ilike(f"%{search}%") |
            models.Note.title.ilike(f"%{search}%")
        )

    # Fetch all matching notes first, then filter by tag in Python.
    # Why: PostgreSQL JSON columns don't support LIKE. The correct fix would be
    # to change the column to JSONB and use the @> operator, but that requires
    # a migration. Filtering in Python is simpler and perfectly fast for this scale.
    notes = query.order_by(models.Note.created_at.desc()).all()

    if tag:
        tag_lower = tag.strip().lower()
        notes = [
            n for n in notes
            if any(t.strip().lower() == tag_lower for t in (n.tags or []))
        ]

    return notes


@app.post("/videos/{video_id}/notes", tags=["Notes"], response_model=schemas.NoteResponse)
def create_note(
    video_id: str,
    body: schemas.NoteCreate,
    db: Session = Depends(database.get_db),
):
    """Creates a new note for a video."""
    note = models.Note(
        video_id=video_id,
        title=body.title,
        content=body.content,
        tags=body.tags,
    )
    db.add(note)
    db.commit()
    db.refresh(note)

    log_event(db, "NOTE_CREATED", f"video_id={video_id} note_id={note.id}")
    return note


@app.put("/notes/{note_id}", tags=["Notes"], response_model=schemas.NoteResponse)
def update_note(
    note_id: int,
    body: schemas.NoteUpdate,
    db: Session = Depends(database.get_db),
):
    """Updates an existing note's title, content, or tags."""
    note = db.query(models.Note).filter(models.Note.id == note_id).first()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found.")

    if body.title is not None:
        note.title = body.title
    if body.content is not None:
        note.content = body.content
    if body.tags is not None:
        note.tags = body.tags

    db.commit()
    db.refresh(note)

    log_event(db, "NOTE_UPDATED", f"note_id={note_id}")
    return note


@app.delete("/notes/{note_id}", tags=["Notes"])
def delete_note(
    note_id: int,
    db: Session = Depends(database.get_db),
):
    """Deletes a note."""
    note = db.query(models.Note).filter(models.Note.id == note_id).first()
    if not note:
        raise HTTPException(status_code=404, detail="Note not found.")

    db.delete(note)
    db.commit()

    log_event(db, "NOTE_DELETED", f"note_id={note_id}")
    return {"status": "success", "message": "Note deleted."}


# ── Event Logs Route ───────────────────────────────────────────────────────────

@app.get("/logs", tags=["Logs"], response_model=List[schemas.EventLogResponse])
def get_logs(
    limit: int = 50,
    db: Session = Depends(database.get_db),
):
    """Returns the most recent event logs."""
    return (
        db.query(models.EventLog)
        .order_by(models.EventLog.timestamp.desc())
        .limit(limit)
        .all()
    )


# ── Local comments lookup (for delete eligibility) ─────────────────────────────

@app.get("/videos/{video_id}/comments/local", tags=["Comments"])
def get_local_comments(
    video_id: str,
    db: Session = Depends(database.get_db),
):
    """
    Returns the list of comments we've posted ourselves (stored in local DB).
    The frontend uses this to know which comments show a delete button.
    """
    comments = db.query(models.Comment).filter(models.Comment.video_id == video_id).all()
    return {"data": [
        {
            "id": c.id,
            "youtube_comment_id": c.youtube_comment_id,
            "parent_youtube_id": c.parent_youtube_id,
            "text": c.text,
        }
        for c in comments
    ]}
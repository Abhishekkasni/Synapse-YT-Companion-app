from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime


# ── Notes ──────────────────────────────────────────────────────────────────────

class NoteCreate(BaseModel):
    video_id: str
    title: Optional[str] = None
    content: str
    tags: List[str] = []


class NoteUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    tags: Optional[List[str]] = None


class NoteResponse(BaseModel):
    id: int
    video_id: str
    title: Optional[str]
    content: Optional[str]
    tags: List[str]
    created_at: datetime

    class Config:
        from_attributes = True


# ── Video ──────────────────────────────────────────────────────────────────────

class VideoMetadataUpdate(BaseModel):
    title: str
    description: str


# ── Comments ───────────────────────────────────────────────────────────────────

class CommentCreate(BaseModel):
    text: str
    parent_id: Optional[str] = None   # YouTube comment ID — set this for replies


class CommentResponse(BaseModel):
    id: int
    video_id: str
    youtube_comment_id: str
    parent_youtube_id: Optional[str]
    text: str
    created_at: datetime

    class Config:
        from_attributes = True


# ── Event Logs ─────────────────────────────────────────────────────────────────

class EventLogResponse(BaseModel):
    id: int
    action: str
    details: str
    timestamp: datetime

    class Config:
        from_attributes = True

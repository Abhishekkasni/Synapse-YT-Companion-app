from sqlalchemy import Column, Integer, String, DateTime, JSON, Text
from sqlalchemy.sql import func
from app.database import Base


class Note(Base):
    __tablename__ = "notes"

    id = Column(Integer, primary_key=True, index=True)
    video_id = Column(String, index=True)
    title = Column(String, nullable=True)          # <-- was missing before
    content = Column(Text, nullable=True)
    tags = Column(JSON, default=[])
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class EventLog(Base):
    __tablename__ = "logs"

    id = Column(Integer, primary_key=True, index=True)
    action = Column(String)
    details = Column(String)
    timestamp = Column(DateTime(timezone=True), server_default=func.now())


class UserSession(Base):
    """
    Stores full OAuth credentials server-side, keyed by access_token.
    This is necessary because the Google client library needs refresh_token,
    client_id, client_secret, and token_uri to make API calls — not just
    the access_token alone.
    """
    __tablename__ = "user_sessions"

    id = Column(Integer, primary_key=True, index=True)
    access_token = Column(String, unique=True, index=True)
    refresh_token = Column(String, nullable=True)
    token_uri = Column(String)
    client_id = Column(String)
    client_secret = Column(String)
    scopes = Column(JSON)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class Comment(Base):
    """
    Mirrors YouTube comments locally so we can track which comments
    belong to us (needed for delete, since YouTube only lets you delete
    your own comments and we need the youtube_comment_id to do it).
    """
    __tablename__ = "comments"

    id = Column(Integer, primary_key=True, index=True)
    video_id = Column(String, index=True)
    youtube_comment_id = Column(String, unique=True, index=True)  # the real YT id
    parent_youtube_id = Column(String, nullable=True)             # set for replies
    text = Column(Text)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

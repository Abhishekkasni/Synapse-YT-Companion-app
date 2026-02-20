"""initial schema - create all tables

Revision ID: 0001
Revises: 
Create Date: 2026-02-19

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = '0001'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── notes ──────────────────────────────────────────────────────────────
    op.create_table(
        'notes',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('video_id', sa.String(), nullable=True, index=True),
        sa.Column('title', sa.String(), nullable=True),
        sa.Column('content', sa.Text(), nullable=True),
        sa.Column('tags', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), onupdate=sa.func.now()),
    )

    # ── logs ───────────────────────────────────────────────────────────────
    op.create_table(
        'logs',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('action', sa.String(), nullable=True),
        sa.Column('details', sa.String(), nullable=True),
        sa.Column('timestamp', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # ── user_sessions ──────────────────────────────────────────────────────
    op.create_table(
        'user_sessions',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('access_token', sa.String(), unique=True, index=True),
        sa.Column('refresh_token', sa.String(), nullable=True),
        sa.Column('token_uri', sa.String(), nullable=True),
        sa.Column('client_id', sa.String(), nullable=True),
        sa.Column('client_secret', sa.String(), nullable=True),
        sa.Column('scopes', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # ── comments ───────────────────────────────────────────────────────────
    op.create_table(
        'comments',
        sa.Column('id', sa.Integer(), primary_key=True),
        sa.Column('video_id', sa.String(), nullable=True, index=True),
        sa.Column('youtube_comment_id', sa.String(), unique=True, index=True),
        sa.Column('parent_youtube_id', sa.String(), nullable=True),
        sa.Column('text', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table('comments')
    op.drop_table('user_sessions')
    op.drop_table('logs')
    op.drop_table('notes')

"""Prerequisite persistence models for the prerequisites route family"""
import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Text, DateTime, ForeignKey, Index, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class PrerequisiteContent(Base):
    """Static content for a prerequisite page, keyed by slug

    Validates Requirements 2.5:
    - Persists editable static content so a subsequent GET returns the saved value
    """
    __tablename__ = "prerequisite_content"

    # Slug identifier (unique per static page, serves as the primary key)
    slug: Mapped[str] = mapped_column(
        String(100),
        primary_key=True,
        index=True,
        nullable=False
    )

    # Persisted content
    content: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        default=""
    )

    # Timestamps
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc)
    )

    # Editor tracking
    updated_by: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id"),
        nullable=True
    )

    def __repr__(self) -> str:
        return f"<PrerequisiteContent(slug={self.slug}, updated_at={self.updated_at})>"


class PrerequisiteAnswer(Base):
    """Client answer for a prerequisite question, scoped per user by (user_id, slug, row_id)

    Validates Requirements 1.1, 1.2:
    - Persists a per-user answer keyed by (user_id, slug, row_id)
    """
    __tablename__ = "prerequisite_answers"

    # Primary key
    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True,
        default=uuid.uuid4,
        server_default="gen_random_uuid()"
    )

    # Owner of this answer (the submitting Member). Non-null: every answer
    # belongs to exactly one user.
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id"),
        index=True,
        nullable=False
    )

    # Slug identifier
    slug: Mapped[str] = mapped_column(
        String(100),
        index=True,
        nullable=False
    )

    # Row identifier within the slug's question set
    row_id: Mapped[str] = mapped_column(
        String(255),
        index=True,
        nullable=False
    )

    # Persisted answer
    answer: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        default=""
    )

    # Timestamps
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc)
    )

    # Editor tracking
    updated_by: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id"),
        nullable=True
    )

    # Unique constraint and indexes
    __table_args__ = (
        UniqueConstraint(
            'user_id', 'slug', 'row_id',
            name='uq_prerequisite_answers_user_slug_row'
        ),
        Index('idx_prerequisite_answers_user_slug', 'user_id', 'slug'),
    )

    def __repr__(self) -> str:
        return f"<PrerequisiteAnswer(id={self.id}, slug={self.slug}, row_id={self.row_id})>"

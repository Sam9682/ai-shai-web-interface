"""Prerequisite persistence models for the prerequisites route family"""
import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Text, DateTime, ForeignKey, Index, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class PrerequisiteContent(Base):
    """Static content for a prerequisite page, scoped per installation by (installation_id, slug)

    Maps the ``prerequisite_content`` table as re-scoped by the multi-instance
    migration (``20260223_0000_multi_instance_opcp_prerequisites``): a surrogate
    UUID ``id`` primary key with a unique ``(installation_id, slug)`` key.

    Validates Requirements 5.1, 7.5:
    - Persists editable static content scoped to an installation so a subsequent
      GET for that installation and slug returns the saved value
    """
    __tablename__ = "prerequisite_content"

    # Surrogate primary key (replaces the former slug primary key)
    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True,
        default=uuid.uuid4,
        server_default="gen_random_uuid()"
    )

    # Owning installation. Non-null: every content row belongs to exactly one
    # installation and is removed with it (ON DELETE CASCADE).
    installation_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey(
            "installations.id",
            name="fk_prerequisite_content_installation_id",
            ondelete="CASCADE"
        ),
        nullable=False
    )

    # Slug identifier (unique per installation)
    slug: Mapped[str] = mapped_column(
        String(100),
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

    # Owning installation relationship
    installation = relationship("Installation", back_populates="content")

    # Unique constraint and supporting index (names match the migration)
    __table_args__ = (
        UniqueConstraint(
            'installation_id', 'slug',
            name='uq_prerequisite_content_installation_slug'
        ),
        Index('ix_prerequisite_content_installation_id', 'installation_id'),
    )

    def __repr__(self) -> str:
        return (
            f"<PrerequisiteContent(id={self.id}, "
            f"installation_id={self.installation_id}, slug={self.slug})>"
        )


class PrerequisiteAnswer(Base):
    """Client answer for a prerequisite question, scoped per installation by (installation_id, slug, row_id)

    Maps the ``prerequisite_answers`` table as re-scoped by the multi-instance
    migration: answers are shared per installation (last-write-wins), no longer
    scoped by ``user_id``.

    Validates Requirements 7.5, 5.1:
    - Persists a per-installation answer keyed by (installation_id, slug, row_id)
    """
    __tablename__ = "prerequisite_answers"

    # Primary key
    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True,
        default=uuid.uuid4,
        server_default="gen_random_uuid()"
    )

    # Owning installation. Non-null: every answer belongs to exactly one
    # installation and is removed with it (ON DELETE CASCADE). Answers are
    # shared per installation (last-write-wins), not scoped per user.
    installation_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey(
            "installations.id",
            name="fk_prerequisite_answers_installation_id",
            ondelete="CASCADE"
        ),
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

    # Owning installation relationship
    installation = relationship("Installation", back_populates="answers")

    # Unique constraint and supporting indexes (names match the migration)
    __table_args__ = (
        UniqueConstraint(
            'installation_id', 'slug', 'row_id',
            name='uq_prerequisite_answers_installation_slug_row'
        ),
        Index(
            'idx_prerequisite_answers_installation_slug',
            'installation_id', 'slug'
        ),
        Index('ix_prerequisite_answers_installation_id', 'installation_id'),
    )

    def __repr__(self) -> str:
        return (
            f"<PrerequisiteAnswer(id={self.id}, "
            f"installation_id={self.installation_id}, "
            f"slug={self.slug}, row_id={self.row_id})>"
        )

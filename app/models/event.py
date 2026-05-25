"""Event models for event management and registration"""
import enum
import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Text, DateTime, Integer, Boolean, Enum as SQLEnum, ForeignKey, Index, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class EventStatus(str, enum.Enum):
    """Event status enumeration"""
    SCHEDULED = "scheduled"
    CANCELLED = "cancelled"
    COMPLETED = "completed"


class Event(Base):
    """Event model for managing association events and meetings
    
    Validates Requirements 6.1, 6.2, 6.3:
    - Stores event details (title, description, dates, location)
    - Tracks event status and participant limits
    - Links to creator for administrative tracking
    """
    __tablename__ = "events"
    
    # Primary key
    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True,
        default=uuid.uuid4,
        server_default="gen_random_uuid()"
    )
    
    # Event details
    title: Mapped[str] = mapped_column(
        String(255),
        nullable=False
    )
    description: Mapped[str | None] = mapped_column(
        Text,
        nullable=True
    )
    
    # Event timing
    start_date: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False
    )
    end_date: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False
    )
    
    # Event location
    location: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True
    )
    
    # Participant management
    max_participants: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True
    )
    
    # Creator relationship
    created_by: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id"),
        nullable=False
    )
    
    # Event status
    status: Mapped[EventStatus] = mapped_column(
        SQLEnum(EventStatus, name="event_status", native_enum=False),
        nullable=False,
        default=EventStatus.SCHEDULED
    )
    
    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc)
    )
    
    # Indexes for efficient queries
    __table_args__ = (
        Index('idx_events_start_date', 'start_date'),
    )
    
    # Relationships
    creator: Mapped["User"] = relationship("User", foreign_keys=[created_by], overlaps="events")
    registrations: Mapped[list["EventRegistration"]] = relationship(
        "EventRegistration",
        back_populates="event",
        cascade="all, delete-orphan"
    )
    
    def __repr__(self) -> str:
        return f"<Event(id={self.id}, title={self.title}, status={self.status})>"


class EventRegistration(Base):
    """Event registration model for tracking participant registrations
    
    Validates Requirements 6.3:
    - Records user registrations for events
    - Tracks registration timestamp
    - Tracks attendance status
    - Ensures unique registration per user per event
    """
    __tablename__ = "event_registrations"
    
    # Primary key
    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True,
        default=uuid.uuid4,
        server_default="gen_random_uuid()"
    )
    
    # Event relationship
    event_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("events.id", ondelete="CASCADE"),
        nullable=False
    )
    
    # User relationship
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id"),
        nullable=False
    )
    
    # Registration timestamp
    registered_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc)
    )
    
    # Attendance tracking
    attended: Mapped[bool | None] = mapped_column(
        Boolean,
        nullable=True
    )
    
    # Unique constraint and indexes
    __table_args__ = (
        UniqueConstraint('event_id', 'user_id', name='uq_event_user_registration'),
        Index('idx_registrations_event', 'event_id'),
    )
    
    # Relationships
    event: Mapped["Event"] = relationship("Event", back_populates="registrations")
    user: Mapped["User"] = relationship("User", overlaps="event_registrations")
    
    def __repr__(self) -> str:
        return f"<EventRegistration(id={self.id}, event_id={self.event_id}, user_id={self.user_id})>"

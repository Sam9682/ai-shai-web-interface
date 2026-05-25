"""Pydantic schemas for event management
Feature: hypervisia-website
Validates Requirements 6.2
"""
from datetime import datetime
from typing import Optional
from uuid import UUID
from pydantic import BaseModel, Field, field_validator


class EventCreateRequest(BaseModel):
    """Request schema for creating an event
    
    Validates Requirements 6.2:
    - Event data validation (dates, location, description)
    """
    title: str = Field(..., min_length=1, max_length=255, description="Event title")
    description: Optional[str] = Field(None, description="Event description")
    start_date: datetime = Field(..., description="Event start date and time")
    end_date: datetime = Field(..., description="Event end date and time")
    location: Optional[str] = Field(None, max_length=255, description="Event location")
    max_participants: Optional[int] = Field(None, ge=1, description="Maximum number of participants")
    
    @field_validator('end_date')
    @classmethod
    def validate_end_date(cls, v: datetime, info) -> datetime:
        """Validate that end_date is after start_date"""
        if 'start_date' in info.data and v <= info.data['start_date']:
            raise ValueError('end_date must be after start_date')
        return v
    
    @field_validator('start_date')
    @classmethod
    def validate_start_date(cls, v: datetime) -> datetime:
        """Validate that start_date is in the future"""
        if v <= datetime.now(v.tzinfo):
            raise ValueError('start_date must be in the future')
        return v


class EventUpdateRequest(BaseModel):
    """Request schema for updating an event"""
    title: Optional[str] = Field(None, min_length=1, max_length=255, description="Event title")
    description: Optional[str] = Field(None, description="Event description")
    start_date: Optional[datetime] = Field(None, description="Event start date and time")
    end_date: Optional[datetime] = Field(None, description="Event end date and time")
    location: Optional[str] = Field(None, max_length=255, description="Event location")
    max_participants: Optional[int] = Field(None, ge=1, description="Maximum number of participants")


class EventResponse(BaseModel):
    """Response schema for event data"""
    id: UUID
    title: str
    description: Optional[str]
    start_date: datetime
    end_date: datetime
    location: Optional[str]
    max_participants: Optional[int]
    created_by: UUID
    status: str
    created_at: datetime
    updated_at: datetime
    participant_count: int = 0
    
    model_config = {
        "from_attributes": True
    }


class EventCreateResponse(BaseModel):
    """Response schema for event creation"""
    success: bool
    message: str
    event: EventResponse


class EventListResponse(BaseModel):
    """Response schema for event listing"""
    success: bool
    events: list[EventResponse]
    total: int
    view_format: str  # "list" or "calendar"


class EventRegistrationResponse(BaseModel):
    """Response schema for event registration"""
    success: bool
    message: str
    registration_id: Optional[UUID] = None
    participant_count: int


class EventUnregistrationResponse(BaseModel):
    """Response schema for event unregistration"""
    success: bool
    message: str
    participant_count: int


class EventCancellationResponse(BaseModel):
    """Response schema for event cancellation"""
    success: bool
    message: str
    event: EventResponse
    notifications_sent: int

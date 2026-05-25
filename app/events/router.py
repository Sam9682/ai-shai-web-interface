"""Event management API endpoints
Feature: hypervisia-website
Validates Requirements 6.1, 6.2, 6.5, 6.7, 10.3
"""
import uuid
from fastapi import APIRouter, Depends, HTTPException, status, Query
from fastapi.responses import Response
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime, timezone
from app.database import get_db
from app.models import User, Event, EventStatus, EventRegistration, NotificationPreferences, UserRole
from app.events.schemas import EventCreateRequest, EventCreateResponse, EventResponse, EventListResponse, EventRegistrationResponse, EventUnregistrationResponse, EventCancellationResponse, EventUpdateRequest
from app.events.dependencies import require_admin
from app.auth.dependencies import get_current_user
from app.services.email_service import email_service
from app.auth.schemas import ErrorResponse
from app.logging_config import logger
from icalendar import Calendar, Event as ICalEvent
from icalendar import vText


router = APIRouter(prefix="/api/events", tags=["events"])


@router.post("", response_model=EventCreateResponse, status_code=status.HTTP_201_CREATED)
async def create_event(
    event_data: EventCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """Create a new event (admin only)
    
    Validates Requirements 6.2, 10.3:
    - Creates event with validated data (dates, location, description)
    - Stores event with all details
    - Sends notification to all members with event notifications enabled
    
    Args:
        event_data: Event creation data
        db: Database session
        current_user: Authenticated administrator user
        
    Returns:
        EventCreateResponse with created event details
        
    Raises:
        HTTPException 403: If user is not an administrator
        HTTPException 400: If event data is invalid
    """
    try:
        # Create event
        new_event = Event(
            title=event_data.title,
            description=event_data.description,
            start_date=event_data.start_date,
            end_date=event_data.end_date,
            location=event_data.location,
            max_participants=event_data.max_participants,
            created_by=current_user.id,
            status=EventStatus.SCHEDULED
        )
        
        db.add(new_event)
        db.commit()
        db.refresh(new_event)
        
        logger.info(
            f"Event created: {new_event.id} - {new_event.title} "
            f"by admin {current_user.id} ({current_user.email})"
        )
        
        # Send notifications to all members with event notifications enabled
        # Query all members (not visitors) with event notifications enabled
        members_to_notify = db.query(User).join(
            NotificationPreferences,
            User.id == NotificationPreferences.user_id,
            isouter=True
        ).filter(
            User.role.in_([UserRole.MEMBER, UserRole.ADMINISTRATOR]),
            User.is_email_verified == True,
            # If preferences exist, check event_notifications; if not, default to True
            (NotificationPreferences.event_notifications == True) | 
            (NotificationPreferences.user_id == None)
        ).all()
        
        # Send email notifications
        notification_count = 0
        for member in members_to_notify:
            # Skip the creator (they already know about the event)
            if member.id == current_user.id:
                continue
            
            # Format dates for email
            start_date_str = new_event.start_date.strftime("%d/%m/%Y à %H:%M")
            end_date_str = new_event.end_date.strftime("%d/%m/%Y à %H:%M")
            
            # Prepare email content
            subject = f"Nouvel événement HYPERVISIA : {new_event.title}"
            
            body_text = f"""
Bonjour {member.first_name},

Un nouvel événement a été créé sur HYPERVISIA :

Titre : {new_event.title}
Date de début : {start_date_str}
Date de fin : {end_date_str}
Lieu : {new_event.location or 'Non spécifié'}

{new_event.description or ''}

Connectez-vous à votre compte HYPERVISIA pour vous inscrire à cet événement.

Cordialement,
L'équipe HYPERVISIA
"""
            
            body_html = f"""
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <style>
        body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
        .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
        .header {{ background-color: #1a1a1a; color: white; padding: 20px; text-align: center; }}
        .content {{ padding: 20px; background-color: #f9f9f9; }}
        .event-details {{ background-color: white; padding: 15px; margin: 20px 0; border-left: 4px solid #1a1a1a; }}
        .footer {{ text-align: center; padding: 20px; font-size: 12px; color: #888; }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>HYPERVISIA</h1>
            <h2>Nouvel Événement</h2>
        </div>
        <div class="content">
            <p>Bonjour {member.first_name},</p>
            <p>Un nouvel événement a été créé sur HYPERVISIA :</p>
            
            <div class="event-details">
                <h3>{new_event.title}</h3>
                <p><strong>Date de début :</strong> {start_date_str}</p>
                <p><strong>Date de fin :</strong> {end_date_str}</p>
                <p><strong>Lieu :</strong> {new_event.location or 'Non spécifié'}</p>
                {f'<p><strong>Description :</strong></p><p>{new_event.description}</p>' if new_event.description else ''}
            </div>
            
            <p>Connectez-vous à votre compte HYPERVISIA pour vous inscrire à cet événement.</p>
            
            <p>Cordialement,<br>
            L'équipe HYPERVISIA</p>
        </div>
        <div class="footer">
            <p>Association HYPERVISIA - Loi 1901</p>
        </div>
    </div>
</body>
</html>
"""
            
            # Send email (don't fail event creation if email fails)
            try:
                email_sent = email_service.send_email(
                    to_email=member.email,
                    subject=subject,
                    body_text=body_text,
                    body_html=body_html
                )
                if email_sent:
                    notification_count += 1
            except Exception as e:
                logger.error(
                    f"Failed to send event notification to {member.email}: {str(e)}",
                    exc_info=True
                )
        
        logger.info(
            f"Sent {notification_count} event notifications for event {new_event.id}"
        )
        
        # Prepare response
        event_response = EventResponse(
            id=new_event.id,
            title=new_event.title,
            description=new_event.description,
            start_date=new_event.start_date,
            end_date=new_event.end_date,
            location=new_event.location,
            max_participants=new_event.max_participants,
            created_by=new_event.created_by,
            status=new_event.status.value,
            created_at=new_event.created_at,
            updated_at=new_event.updated_at,
            participant_count=0
        )
        
        return EventCreateResponse(
            success=True,
            message=f"Event created successfully. Notifications sent to {notification_count} members.",
            event=event_response
        )
    
    except ValueError as e:
        # Validation errors from Pydantic
        logger.warning(f"Event creation validation error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=ErrorResponse.create(
                code="VALIDATION_ERROR",
                message=str(e),
                details={}
            )
        )
    except Exception as e:
        logger.error(f"Error creating event: {str(e)}", exc_info=True)
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=ErrorResponse.create(
                code="EVENT_CREATION_FAILED",
                message="Failed to create event",
                details={"error": str(e)}
            )
        )


@router.get("", response_model=EventListResponse, status_code=status.HTTP_200_OK)
async def list_events(
    view: str = Query("list", pattern="^(list|calendar)$", description="View format: 'list' or 'calendar'"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """List upcoming events
    
    Validates Requirements 6.1, 6.5:
    - Displays all upcoming events (start_date >= current date)
    - Supports both calendar and list view formats
    - Returns same events regardless of view format (consistency)
    
    Args:
        view: View format ("list" or "calendar")
        db: Database session
        current_user: Authenticated user
        
    Returns:
        EventListResponse with list of upcoming events
        
    Raises:
        HTTPException 401: If user is not authenticated
        HTTPException 400: If view parameter is invalid
    """
    try:
        # Get current time
        now = datetime.now(timezone.utc)
        
        # Query upcoming events (start_date >= current date)
        # Only show scheduled events (not cancelled or completed)
        events_query = db.query(Event).filter(
            Event.start_date >= now,
            Event.status == EventStatus.SCHEDULED
        ).order_by(Event.start_date.asc())
        
        events = events_query.all()
        
        # Build response with participant counts
        event_responses = []
        for event in events:
            # Count participants for this event
            participant_count = db.query(func.count(EventRegistration.id)).filter(
                EventRegistration.event_id == event.id
            ).scalar() or 0
            
            event_response = EventResponse(
                id=event.id,
                title=event.title,
                description=event.description,
                start_date=event.start_date,
                end_date=event.end_date,
                location=event.location,
                max_participants=event.max_participants,
                created_by=event.created_by,
                status=event.status.value,
                created_at=event.created_at,
                updated_at=event.updated_at,
                participant_count=participant_count
            )
            event_responses.append(event_response)
        
        logger.info(
            f"User {current_user.id} ({current_user.email}) listed {len(event_responses)} "
            f"upcoming events in {view} view"
        )
        
        return EventListResponse(
            success=True,
            events=event_responses,
            total=len(event_responses),
            view_format=view
        )
    
    except Exception as e:
        logger.error(f"Error listing events: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=ErrorResponse.create(
                code="EVENT_LISTING_FAILED",
                message="Failed to retrieve events",
                details={"error": str(e)}
            )
        )



@router.post("/{event_id}/register", response_model=EventRegistrationResponse, status_code=status.HTTP_201_CREATED)
async def register_for_event(
    event_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Register for an event
    
    Validates Requirements 6.3:
    - Creates EventRegistration record
    - Checks max_participants limit
    - Updates participant count
    - Prevents duplicate registrations
    
    Args:
        event_id: Event UUID
        db: Database session
        current_user: Authenticated user
        
    Returns:
        EventRegistrationResponse with registration details
        
    Raises:
        HTTPException 401: If user is not authenticated
        HTTPException 404: If event not found
        HTTPException 400: If already registered or event is full
        HTTPException 409: If event is cancelled
    """
    try:
        # Parse event_id as UUID
        try:
            event_uuid = uuid.UUID(event_id)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=ErrorResponse.create(
                    code="INVALID_EVENT_ID",
                    message="Invalid event ID format",
                    details={}
                )
            )
        
        # Check if event exists
        event = db.query(Event).filter(Event.id == event_uuid).first()
        if not event:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=ErrorResponse.create(
                    code="EVENT_NOT_FOUND",
                    message="Event not found",
                    details={}
                )
            )
        
        # Check if event is cancelled
        if event.status == EventStatus.CANCELLED:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=ErrorResponse.create(
                    code="EVENT_CANCELLED",
                    message="Cannot register for a cancelled event",
                    details={}
                )
            )
        
        # Check if user is already registered
        existing_registration = db.query(EventRegistration).filter(
            EventRegistration.event_id == event_uuid,
            EventRegistration.user_id == current_user.id
        ).first()
        
        if existing_registration:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=ErrorResponse.create(
                    code="ALREADY_REGISTERED",
                    message="You are already registered for this event",
                    details={}
                )
            )
        
        # Check max_participants limit
        if event.max_participants is not None:
            current_participant_count = db.query(func.count(EventRegistration.id)).filter(
                EventRegistration.event_id == event_uuid
            ).scalar() or 0
            
            if current_participant_count >= event.max_participants:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=ErrorResponse.create(
                        code="EVENT_FULL",
                        message="Event has reached maximum participant limit",
                        details={"max_participants": event.max_participants}
                    )
                )
        
        # Create registration
        new_registration = EventRegistration(
            event_id=event_uuid,
            user_id=current_user.id
        )
        
        db.add(new_registration)
        db.commit()
        db.refresh(new_registration)
        
        # Get updated participant count
        participant_count = db.query(func.count(EventRegistration.id)).filter(
            EventRegistration.event_id == event_uuid
        ).scalar() or 0
        
        logger.info(
            f"User {current_user.id} ({current_user.email}) registered for event {event_uuid} "
            f"({event.title}). Total participants: {participant_count}"
        )
        
        return EventRegistrationResponse(
            success=True,
            message="Successfully registered for event",
            registration_id=new_registration.id,
            participant_count=participant_count
        )
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error registering for event: {str(e)}", exc_info=True)
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=ErrorResponse.create(
                code="REGISTRATION_FAILED",
                message="Failed to register for event",
                details={"error": str(e)}
            )
        )


@router.delete("/{event_id}/register", response_model=EventUnregistrationResponse, status_code=status.HTTP_200_OK)
async def unregister_from_event(
    event_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Unregister from an event
    
    Validates Requirements 6.3:
    - Removes EventRegistration record
    - Updates participant count
    
    Args:
        event_id: Event UUID
        db: Database session
        current_user: Authenticated user
        
    Returns:
        EventUnregistrationResponse with updated participant count
        
    Raises:
        HTTPException 401: If user is not authenticated
        HTTPException 404: If event not found or not registered
        HTTPException 400: If invalid event ID
    """
    try:
        # Parse event_id as UUID
        try:
            event_uuid = uuid.UUID(event_id)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=ErrorResponse.create(
                    code="INVALID_EVENT_ID",
                    message="Invalid event ID format",
                    details={}
                )
            )
        
        # Check if event exists
        event = db.query(Event).filter(Event.id == event_uuid).first()
        if not event:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=ErrorResponse.create(
                    code="EVENT_NOT_FOUND",
                    message="Event not found",
                    details={}
                )
            )
        
        # Check if user is registered
        registration = db.query(EventRegistration).filter(
            EventRegistration.event_id == event_uuid,
            EventRegistration.user_id == current_user.id
        ).first()
        
        if not registration:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=ErrorResponse.create(
                    code="NOT_REGISTERED",
                    message="You are not registered for this event",
                    details={}
                )
            )
        
        # Delete registration
        db.delete(registration)
        db.commit()
        
        # Get updated participant count
        participant_count = db.query(func.count(EventRegistration.id)).filter(
            EventRegistration.event_id == event_uuid
        ).scalar() or 0
        
        logger.info(
            f"User {current_user.id} ({current_user.email}) unregistered from event {event_uuid} "
            f"({event.title}). Total participants: {participant_count}"
        )
        
        return EventUnregistrationResponse(
            success=True,
            message="Successfully unregistered from event",
            participant_count=participant_count
        )
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error unregistering from event: {str(e)}", exc_info=True)
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=ErrorResponse.create(
                code="UNREGISTRATION_FAILED",
                message="Failed to unregister from event",
                details={"error": str(e)}
            )
        )



@router.put("/{event_id}", response_model=EventResponse, status_code=status.HTTP_200_OK)
async def update_event(
    event_id: str,
    event_data: EventUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """Update an event (admin only)"""
    try:
        event_uuid = uuid.UUID(event_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=ErrorResponse.create(
                code="INVALID_EVENT_ID",
                message="Invalid event ID format",
                details={}
            )
        )
    
    event = db.query(Event).filter(Event.id == event_uuid).first()
    if not event:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=ErrorResponse.create(
                code="EVENT_NOT_FOUND",
                message="Event not found",
                details={}
            )
        )
    
    if event_data.title is not None:
        event.title = event_data.title
    if event_data.description is not None:
        event.description = event_data.description
    if event_data.start_date is not None:
        event.start_date = event_data.start_date
    if event_data.end_date is not None:
        event.end_date = event_data.end_date
    if event_data.location is not None:
        event.location = event_data.location
    if event_data.max_participants is not None:
        event.max_participants = event_data.max_participants
    
    event.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(event)
    
    participant_count = db.query(func.count(EventRegistration.id)).filter(
        EventRegistration.event_id == event_uuid
    ).scalar() or 0
    
    logger.info(f"Event {event.id} updated by admin {current_user.id}")
    
    return EventResponse(
        id=event.id,
        title=event.title,
        description=event.description,
        start_date=event.start_date,
        end_date=event.end_date,
        location=event.location,
        max_participants=event.max_participants,
        created_by=event.created_by,
        status=event.status.value,
        created_at=event.created_at,
        updated_at=event.updated_at,
        participant_count=participant_count
    )


@router.put("/{event_id}/cancel", response_model=EventCancellationResponse, status_code=status.HTTP_200_OK)
async def cancel_event(
    event_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    """Cancel an event (admin only)
    
    Validates Requirements 6.6:
    - Updates event status to cancelled
    - Sends cancellation emails to all registered participants
    
    Args:
        event_id: Event UUID
        db: Database session
        current_user: Authenticated administrator user
        
    Returns:
        EventCancellationResponse with updated event and notification count
        
    Raises:
        HTTPException 403: If user is not an administrator
        HTTPException 404: If event not found
        HTTPException 400: If event is already cancelled
    """
    try:
        # Parse event_id as UUID
        try:
            event_uuid = uuid.UUID(event_id)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=ErrorResponse.create(
                    code="INVALID_EVENT_ID",
                    message="Invalid event ID format",
                    details={}
                )
            )
        
        # Check if event exists
        event = db.query(Event).filter(Event.id == event_uuid).first()
        if not event:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=ErrorResponse.create(
                    code="EVENT_NOT_FOUND",
                    message="Event not found",
                    details={}
                )
            )
        
        # Check if event is already cancelled
        if event.status == EventStatus.CANCELLED:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=ErrorResponse.create(
                    code="EVENT_ALREADY_CANCELLED",
                    message="Event is already cancelled",
                    details={}
                )
            )
        
        # Update event status to cancelled
        event.status = EventStatus.CANCELLED
        db.commit()
        db.refresh(event)
        
        logger.info(
            f"Event {event.id} ({event.title}) cancelled by admin {current_user.id} "
            f"({current_user.email})"
        )
        
        # Get all registered participants
        registrations = db.query(EventRegistration).filter(
            EventRegistration.event_id == event_uuid
        ).all()
        
        # Get user details for all registered participants
        participant_ids = [reg.user_id for reg in registrations]
        participants = db.query(User).filter(User.id.in_(participant_ids)).all() if participant_ids else []
        
        # Send cancellation emails to all registered participants
        notification_count = 0
        for participant in participants:
            # Format dates for email
            start_date_str = event.start_date.strftime("%d/%m/%Y à %H:%M")
            end_date_str = event.end_date.strftime("%d/%m/%Y à %H:%M")
            
            # Prepare email content
            subject = f"Annulation d'événement HYPERVISIA : {event.title}"
            
            body_text = f"""
Bonjour {participant.first_name},

Nous vous informons que l'événement suivant a été annulé :

Titre : {event.title}
Date de début : {start_date_str}
Date de fin : {end_date_str}
Lieu : {event.location or 'Non spécifié'}

{event.description or ''}

Nous nous excusons pour tout inconvénient que cela pourrait causer.

Cordialement,
L'équipe HYPERVISIA
"""
            
            body_html = f"""
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <style>
        body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
        .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
        .header {{ background-color: #d32f2f; color: white; padding: 20px; text-align: center; }}
        .content {{ padding: 20px; background-color: #f9f9f9; }}
        .event-details {{ background-color: white; padding: 15px; margin: 20px 0; border-left: 4px solid #d32f2f; }}
        .footer {{ text-align: center; padding: 20px; font-size: 12px; color: #888; }}
        .cancelled {{ color: #d32f2f; font-weight: bold; }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>HYPERVISIA</h1>
            <h2 class="cancelled">Événement Annulé</h2>
        </div>
        <div class="content">
            <p>Bonjour {participant.first_name},</p>
            <p>Nous vous informons que l'événement suivant a été <strong class="cancelled">annulé</strong> :</p>
            
            <div class="event-details">
                <h3>{event.title}</h3>
                <p><strong>Date de début :</strong> {start_date_str}</p>
                <p><strong>Date de fin :</strong> {end_date_str}</p>
                <p><strong>Lieu :</strong> {event.location or 'Non spécifié'}</p>
                {f'<p><strong>Description :</strong></p><p>{event.description}</p>' if event.description else ''}
            </div>
            
            <p>Nous nous excusons pour tout inconvénient que cela pourrait causer.</p>
            
            <p>Cordialement,<br>
            L'équipe HYPERVISIA</p>
        </div>
        <div class="footer">
            <p>Association HYPERVISIA - Loi 1901</p>
        </div>
    </div>
</body>
</html>
"""
            
            # Send email (don't fail cancellation if email fails)
            try:
                email_sent = email_service.send_email(
                    to_email=participant.email,
                    subject=subject,
                    body_text=body_text,
                    body_html=body_html
                )
                if email_sent:
                    notification_count += 1
            except Exception as e:
                logger.error(
                    f"Failed to send cancellation notification to {participant.email}: {str(e)}",
                    exc_info=True
                )
        
        logger.info(
            f"Sent {notification_count} cancellation notifications for event {event.id} "
            f"to {len(participants)} registered participants"
        )
        
        # Get participant count
        participant_count = len(participants)
        
        # Prepare response
        event_response = EventResponse(
            id=event.id,
            title=event.title,
            description=event.description,
            start_date=event.start_date,
            end_date=event.end_date,
            location=event.location,
            max_participants=event.max_participants,
            created_by=event.created_by,
            status=event.status.value,
            created_at=event.created_at,
            updated_at=event.updated_at,
            participant_count=participant_count
        )
        
        return EventCancellationResponse(
            success=True,
            message=f"Event cancelled successfully. Notifications sent to {notification_count} participants.",
            event=event_response,
            notifications_sent=notification_count
        )
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error cancelling event: {str(e)}", exc_info=True)
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=ErrorResponse.create(
                code="EVENT_CANCELLATION_FAILED",
                message="Failed to cancel event",
                details={"error": str(e)}
            )
        )



@router.get("/export/ical", status_code=status.HTTP_200_OK)
async def export_events_ical(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Export events to iCal format
    
    Validates Requirements 6.7:
    - Generates valid iCal format file
    - Includes all event details (title, description, dates, location)
    - Returns file that can be imported into calendar applications
    
    Args:
        db: Database session
        current_user: Authenticated user
        
    Returns:
        iCal file with all upcoming events
        
    Raises:
        HTTPException 401: If user is not authenticated
        HTTPException 500: If iCal generation fails
    """
    try:
        # Get current time
        now = datetime.now(timezone.utc)
        
        # Query upcoming events (start_date >= current date)
        # Only show scheduled events (not cancelled or completed)
        events = db.query(Event).filter(
            Event.start_date >= now,
            Event.status == EventStatus.SCHEDULED
        ).order_by(Event.start_date.asc()).all()
        
        # Create calendar
        cal = Calendar()
        cal.add('prodid', '-//HYPERVISIA Association//Events Calendar//FR')
        cal.add('version', '2.0')
        cal.add('calscale', 'GREGORIAN')
        cal.add('method', 'PUBLISH')
        cal.add('x-wr-calname', 'HYPERVISIA Events')
        cal.add('x-wr-timezone', 'Europe/Paris')
        cal.add('x-wr-caldesc', 'Événements de l\'association HYPERVISIA')
        
        # Add each event to the calendar
        for event in events:
            ical_event = ICalEvent()
            
            # Required fields
            ical_event.add('uid', f'{event.id}@hypervisia.org')
            ical_event.add('dtstamp', datetime.now(timezone.utc))
            ical_event.add('dtstart', event.start_date)
            ical_event.add('dtend', event.end_date)
            ical_event.add('summary', event.title)
            
            # Optional fields
            if event.description:
                ical_event.add('description', event.description)
            
            if event.location:
                ical_event.add('location', vText(event.location))
            
            # Add status
            ical_event.add('status', 'CONFIRMED')
            
            # Add creation and modification timestamps
            ical_event.add('created', event.created_at)
            ical_event.add('last-modified', event.updated_at)
            
            # Add organizer (association)
            ical_event.add('organizer', 'HYPERVISIA Association')
            
            # Add to calendar
            cal.add_component(ical_event)
        
        # Generate iCal content
        ical_content = cal.to_ical()
        
        logger.info(
            f"User {current_user.id} ({current_user.email}) exported {len(events)} "
            f"events to iCal format"
        )
        
        # Return as downloadable file
        return Response(
            content=ical_content,
            media_type="text/calendar",
            headers={
                "Content-Disposition": "attachment; filename=hypervisia_events.ics"
            }
        )
    
    except Exception as e:
        logger.error(f"Error exporting events to iCal: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=ErrorResponse.create(
                code="ICAL_EXPORT_FAILED",
                message="Failed to export events to iCal format",
                details={"error": str(e)}
            )
        )

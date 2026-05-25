"""Administration API endpoints"""
from uuid import UUID
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status, Request
from sqlalchemy.orm import Session
from sqlalchemy import and_, func
from app.database import get_db
from app.models import User, UserRole, AuditLog, Topic, Post, Event, EventStatus, Payment, PaymentStatus
from app.events.dependencies import require_admin
from app.admin.schemas import (
    RoleUpdateRequest,
    RoleUpdateResponse,
    MembershipStatusUpdateRequest,
    MembershipStatusUpdateResponse,
    EmailVerificationUpdateRequest,
    EmailVerificationUpdateResponse,
    MemberListResponse,
    MemberSummary,
    DeactivateMemberResponse,
    AuditLogEntry,
    AuditLogResponse,
    ActivityReportResponse,
    ForumActivityStats,
    AnnouncementRequest,
    AnnouncementResponse
)
from app.auth.schemas import ErrorResponse
from app.logging_config import logger
from app.middleware.rate_limit import limiter
from app.services.notification_service import notification_service
from datetime import datetime, timezone

router = APIRouter(prefix="/api/admin", tags=["administration"])


@router.put(
    "/members/{member_id}/role",
    response_model=RoleUpdateResponse,
    status_code=status.HTTP_200_OK,
    responses={
        403: {"description": "Insufficient permissions - administrator role required"},
        404: {"description": "Member not found"},
        400: {"description": "Invalid role value"}
    }
)
@limiter.limit("30/hour")  # Limit role changes to prevent abuse
async def update_member_role(
    request: Request,
    member_id: UUID,
    role_data: RoleUpdateRequest,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
) -> RoleUpdateResponse:
    """Update a member's role.
    
    Validates Requirements 7.1, 7.2, 7.5:
    - Administrator can assign roles to members (7.1)
    - Restricts administrative functions to administrator role (7.2)
    - Logs action in audit log with timestamp and admin identity (7.5)
    
    Args:
        member_id: UUID of the member to update
        role_data: New role information
        current_user: Authenticated administrator
        db: Database session
        
    Returns:
        RoleUpdateResponse with updated user details
        
    Raises:
        HTTPException 403: If user is not an administrator
        HTTPException 404: If member not found
        HTTPException 400: If role value is invalid
    """
    # Fetch the member to update
    member = db.query(User).filter(User.id == member_id).first()
    if not member:
        logger.warning(
            f"Administrator {current_user.id} attempted to update role for "
            f"non-existent member {member_id}"
        )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=ErrorResponse.create(
                code="MEMBER_NOT_FOUND",
                message="Member not found",
                details={"member_id": str(member_id)}
            )
        )
    
    # Validate and convert role string to UserRole enum
    try:
        new_role = UserRole(role_data.role)
    except ValueError:
        logger.warning(
            f"Administrator {current_user.id} provided invalid role: {role_data.role}"
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=ErrorResponse.create(
                code="INVALID_ROLE",
                message="Invalid role value",
                details={
                    "provided_role": role_data.role,
                    "valid_roles": ["visitor", "member", "administrator"]
                }
            )
        )
    
    # Store old role for audit log
    old_role = member.role
    
    # Update the member's role (Requirement 7.1)
    member.role = new_role
    member.updated_at = datetime.now(timezone.utc)
    
    # Create audit log entry (Requirement 7.5)
    audit_entry = AuditLog(
        admin_id=current_user.id,
        action="update_member_role",
        target_type="user",
        target_id=member.id,
        details={
            "old_role": old_role.value,
            "new_role": new_role.value,
            "member_email": member.email
        }
    )
    db.add(audit_entry)
    
    # Commit changes
    db.commit()
    db.refresh(member)
    
    logger.info(
        f"Administrator {current_user.id} ({current_user.email}) updated role for "
        f"member {member.id} ({member.email}) from {old_role.value} to {new_role.value}"
    )
    
    return RoleUpdateResponse(
        id=str(member.id),
        email=member.email,
        first_name=member.first_name,
        last_name=member.last_name,
        role=member.role.value,
        message="User role updated successfully"
    )


@router.put(
    "/members/{member_id}/membership-status",
    response_model=MembershipStatusUpdateResponse,
    status_code=status.HTTP_200_OK,
    responses={
        403: {"description": "Insufficient permissions - administrator role required"},
        404: {"description": "Member not found"}
    }
)
@limiter.limit("30/hour")
async def update_membership_status(
    request: Request,
    member_id: UUID,
    status_data: MembershipStatusUpdateRequest,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
) -> MembershipStatusUpdateResponse:
    """Update a member's membership status.
    
    Allows administrator to set membership expiration date.
    Setting to None grants lifetime membership.
    
    Args:
        member_id: UUID of the member to update
        status_data: New membership status information
        current_user: Authenticated administrator
        db: Database session
        
    Returns:
        MembershipStatusUpdateResponse with updated membership details
        
    Raises:
        HTTPException 403: If user is not an administrator
        HTTPException 404: If member not found
    """
    # Fetch the member to update
    member = db.query(User).filter(User.id == member_id).first()
    if not member:
        logger.warning(
            f"Administrator {current_user.id} attempted to update membership status for "
            f"non-existent member {member_id}"
        )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=ErrorResponse.create(
                code="MEMBER_NOT_FOUND",
                message="Member not found",
                details={"member_id": str(member_id)}
            )
        )
    
    # Store old status for audit log
    old_expires_at = member.membership_expires_at
    old_status = member.membership_status
    
    # Update the member's membership expiration if provided
    if status_data.membership_expires_at is not None:
        member.membership_expires_at = status_data.membership_expires_at
    
    # Update membership_status if explicitly provided (admin override)
    if status_data.membership_status is not None:
        member.membership_status = status_data.membership_status
        membership_status = status_data.membership_status
    else:
        # Calculate membership status automatically if not forced
        now = datetime.now(timezone.utc)
        if not member.is_email_verified:
            membership_status = "suspended"
        elif member.membership_expires_at is None:
            membership_status = "active"
        else:
            expires_at = member.membership_expires_at
            if expires_at.tzinfo is None:
                expires_at = expires_at.replace(tzinfo=timezone.utc)
            membership_status = "active" if expires_at > now else "expired"
        member.membership_status = membership_status
    
    member.updated_at = datetime.now(timezone.utc)
    
    # Create audit log entry
    audit_entry = AuditLog(
        admin_id=current_user.id,
        action="update_membership_status",
        target_type="user",
        target_id=member.id,
        details={
            "old_membership_expires_at": old_expires_at.isoformat() if old_expires_at else None,
            "new_membership_expires_at": member.membership_expires_at.isoformat() if member.membership_expires_at else None,
            "old_membership_status": old_status,
            "new_membership_status": membership_status,
            "member_email": member.email
        }
    )
    db.add(audit_entry)
    
    # Commit changes
    db.commit()
    db.refresh(member)
    
    logger.info(
        f"Administrator {current_user.id} ({current_user.email}) updated membership status for "
        f"member {member.id} ({member.email})"
    )
    
    return MembershipStatusUpdateResponse(
        id=str(member.id),
        email=member.email,
        membership_expires_at=member.membership_expires_at,
        membership_status=membership_status,
        message="Membership status updated successfully"
    )


@router.put(
    "/members/{member_id}/email-verification",
    response_model=EmailVerificationUpdateResponse,
    status_code=status.HTTP_200_OK,
    responses={
        403: {"description": "Insufficient permissions - administrator role required"},
        404: {"description": "Member not found"}
    }
)
@limiter.limit("30/hour")
async def update_email_verification(
    request: Request,
    member_id: UUID,
    verification_data: EmailVerificationUpdateRequest,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
) -> EmailVerificationUpdateResponse:
    """Update a member's email verification status.
    
    Allows administrator to manually verify or unverify a member's email.
    This affects the membership status (suspended if not verified).
    
    Args:
        member_id: UUID of the member to update
        verification_data: New email verification status
        current_user: Authenticated administrator
        db: Database session
        
    Returns:
        EmailVerificationUpdateResponse with updated verification details
        
    Raises:
        HTTPException 403: If user is not an administrator
        HTTPException 404: If member not found
    """
    # Fetch the member to update
    member = db.query(User).filter(User.id == member_id).first()
    if not member:
        logger.warning(
            f"Administrator {current_user.id} attempted to update email verification for "
            f"non-existent member {member_id}"
        )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=ErrorResponse.create(
                code="MEMBER_NOT_FOUND",
                message="Member not found",
                details={"member_id": str(member_id)}
            )
        )
    
    # Store old status for audit log
    old_verified = member.is_email_verified
    
    # Update the member's email verification status
    member.is_email_verified = verification_data.is_email_verified
    member.updated_at = datetime.now(timezone.utc)
    
    # Calculate new membership status
    now = datetime.now(timezone.utc)
    if not member.is_email_verified:
        membership_status = "suspended"
    elif member.membership_expires_at is None:
        membership_status = "active"
    else:
        expires_at = member.membership_expires_at
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        membership_status = "active" if expires_at > now else "expired"
    
    # Create audit log entry
    audit_entry = AuditLog(
        admin_id=current_user.id,
        action="update_email_verification",
        target_type="user",
        target_id=member.id,
        details={
            "old_is_email_verified": old_verified,
            "new_is_email_verified": member.is_email_verified,
            "member_email": member.email
        }
    )
    db.add(audit_entry)
    
    # Commit changes
    db.commit()
    db.refresh(member)
    
    logger.info(
        f"Administrator {current_user.id} ({current_user.email}) updated email verification for "
        f"member {member.id} ({member.email}) from {old_verified} to {member.is_email_verified}"
    )
    
    return EmailVerificationUpdateResponse(
        id=str(member.id),
        email=member.email,
        is_email_verified=member.is_email_verified,
        membership_status=membership_status,
        message="Email verification status updated successfully"
    )



@router.get(
    "/members",
    response_model=MemberListResponse,
    status_code=status.HTTP_200_OK,
    responses={
        403: {"description": "Insufficient permissions - administrator role required"}
    }
)
async def list_members(
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
) -> MemberListResponse:
    """List all members with their roles and membership status.
    
    Validates Requirements 7.3:
    - Administrator can view all members with their roles and membership status
    
    Args:
        current_user: Authenticated administrator
        db: Database session
        
    Returns:
        MemberListResponse with list of all members
        
    Raises:
        HTTPException 403: If user is not an administrator
    """
    # Fetch all users from the database
    members = db.query(User).order_by(User.created_at.desc()).all()
    
    # Calculate membership status for each member
    member_summaries = []
    now = datetime.now(timezone.utc)
    
    for member in members:
        # Use stored membership_status if available (admin override), otherwise calculate
        if member.membership_status:
            membership_status = member.membership_status
        elif not member.is_email_verified:
            membership_status = "suspended"
        elif member.membership_expires_at is None:
            membership_status = "active"
        else:
            expires_at = member.membership_expires_at
            if expires_at.tzinfo is None:
                expires_at = expires_at.replace(tzinfo=timezone.utc)
            membership_status = "active" if expires_at > now else "expired"
        
        member_summaries.append(
            MemberSummary(
                id=str(member.id),
                email=member.email,
                first_name=member.first_name,
                last_name=member.last_name,
                role=member.role.value,
                is_email_verified=member.is_email_verified,
                membership_expires_at=member.membership_expires_at,
                membership_status=membership_status,
                created_at=member.created_at
            )
        )
    
    logger.info(
        f"Administrator {current_user.id} ({current_user.email}) retrieved member list "
        f"with {len(member_summaries)} members"
    )
    
    return MemberListResponse(
        members=member_summaries,
        total=len(member_summaries)
    )



@router.put(
    "/members/{member_id}/deactivate",
    response_model=DeactivateMemberResponse,
    status_code=status.HTTP_200_OK,
    responses={
        403: {"description": "Insufficient permissions - administrator role required"},
        404: {"description": "Member not found"}
    }
)
@limiter.limit("30/hour")  # Limit deactivation to prevent abuse
async def deactivate_member(
    request: Request,
    member_id: UUID,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
) -> DeactivateMemberResponse:
    """Deactivate a member account.
    
    Validates Requirements 7.4:
    - Administrator can deactivate member accounts
    - Revokes access while preserving historical data
    
    Deactivation strategy:
    - Sets is_email_verified to False (prevents login)
    - Sets membership_expires_at to current time (marks as expired)
    - Preserves all historical data (posts, payments, registrations)
    - Logs action in audit log
    
    Args:
        member_id: UUID of the member to deactivate
        current_user: Authenticated administrator
        db: Database session
        
    Returns:
        DeactivateMemberResponse with confirmation
        
    Raises:
        HTTPException 403: If user is not an administrator
        HTTPException 404: If member not found
    """
    # Fetch the member to deactivate
    member = db.query(User).filter(User.id == member_id).first()
    if not member:
        logger.warning(
            f"Administrator {current_user.id} attempted to deactivate "
            f"non-existent member {member_id}"
        )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=ErrorResponse.create(
                code="MEMBER_NOT_FOUND",
                message="Member not found",
                details={"member_id": str(member_id)}
            )
        )
    
    # Store old status for audit log
    old_verified = member.is_email_verified
    old_expires_at = member.membership_expires_at
    
    # Deactivate the member (Requirement 7.4)
    # Revoke access by marking email as unverified and expiring membership
    member.is_email_verified = False
    member.membership_expires_at = datetime.now(timezone.utc)
    member.updated_at = datetime.now(timezone.utc)
    
    # Note: We do NOT delete any related data (posts, payments, registrations)
    # This preserves historical data as required by 7.4
    
    # Create audit log entry (Requirement 7.5)
    audit_entry = AuditLog(
        admin_id=current_user.id,
        action="deactivate_member",
        target_type="user",
        target_id=member.id,
        details={
            "member_email": member.email,
            "old_is_email_verified": old_verified,
            "old_membership_expires_at": old_expires_at.isoformat() if old_expires_at else None,
            "new_is_email_verified": False,
            "new_membership_expires_at": member.membership_expires_at.isoformat()
        }
    )
    db.add(audit_entry)
    
    # Commit changes
    db.commit()
    db.refresh(member)
    
    logger.info(
        f"Administrator {current_user.id} ({current_user.email}) deactivated "
        f"member {member.id} ({member.email})"
    )
    
    return DeactivateMemberResponse(
        id=str(member.id),
        email=member.email,
        message="Member account deactivated successfully"
    )



@router.get(
    "/audit-log",
    response_model=AuditLogResponse,
    status_code=status.HTTP_200_OK,
    responses={
        403: {"description": "Insufficient permissions - administrator role required"}
    }
)
async def get_audit_log(
    admin_id: Optional[UUID] = Query(None, description="Filter by admin ID"),
    action: Optional[str] = Query(None, description="Filter by action type"),
    start_date: Optional[datetime] = Query(None, description="Filter by start date (inclusive)"),
    end_date: Optional[datetime] = Query(None, description="Filter by end date (inclusive)"),
    page: int = Query(1, ge=1, description="Page number (1-indexed)"),
    page_size: int = Query(50, ge=1, le=100, description="Number of entries per page"),
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
) -> AuditLogResponse:
    """Get audit log with filtering and pagination.
    
    Validates Requirements 7.5:
    - Administrator can view audit log of all administrative actions
    - Supports filtering by admin, action type, and date range
    - Paginates results for efficient retrieval
    
    Args:
        admin_id: Optional filter by admin user ID
        action: Optional filter by action type (e.g., "update_member_role", "deactivate_member")
        start_date: Optional filter by start date (inclusive)
        end_date: Optional filter by end date (inclusive)
        page: Page number (1-indexed)
        page_size: Number of entries per page (max 100)
        current_user: Authenticated administrator
        db: Database session
        
    Returns:
        AuditLogResponse with paginated audit log entries
        
    Raises:
        HTTPException 403: If user is not an administrator
    """
    # Build query with filters
    query = db.query(AuditLog)
    
    # Apply filters
    filters = []
    if admin_id is not None:
        filters.append(AuditLog.admin_id == admin_id)
    if action is not None:
        filters.append(AuditLog.action == action)
    if start_date is not None:
        # Ensure timezone-aware comparison
        if start_date.tzinfo is None:
            start_date = start_date.replace(tzinfo=timezone.utc)
        filters.append(AuditLog.timestamp >= start_date)
    if end_date is not None:
        # Ensure timezone-aware comparison
        if end_date.tzinfo is None:
            end_date = end_date.replace(tzinfo=timezone.utc)
        filters.append(AuditLog.timestamp <= end_date)
    
    if filters:
        query = query.filter(and_(*filters))
    
    # Get total count before pagination
    total = query.count()
    
    # Apply pagination and ordering (most recent first)
    offset = (page - 1) * page_size
    audit_entries = query.order_by(AuditLog.timestamp.desc()).offset(offset).limit(page_size).all()
    
    # Build response with denormalized admin email for convenience
    entries = []
    for entry in audit_entries:
        # Fetch admin email if admin_id exists
        admin_email = None
        if entry.admin_id:
            admin = db.query(User).filter(User.id == entry.admin_id).first()
            if admin:
                admin_email = admin.email
        
        entries.append(
            AuditLogEntry(
                id=str(entry.id),
                admin_id=str(entry.admin_id) if entry.admin_id else None,
                admin_email=admin_email,
                action=entry.action,
                target_type=entry.target_type,
                target_id=str(entry.target_id) if entry.target_id else None,
                details=entry.details,
                timestamp=entry.timestamp
            )
        )
    
    logger.info(
        f"Administrator {current_user.id} ({current_user.email}) retrieved audit log "
        f"(page {page}, {len(entries)} entries, {total} total)"
    )
    
    return AuditLogResponse(
        entries=entries,
        total=total,
        page=page,
        page_size=page_size
    )



@router.get(
    "/reports/activity",
    response_model=ActivityReportResponse,
    status_code=status.HTTP_200_OK,
    responses={
        403: {"description": "Insufficient permissions - administrator role required"},
        400: {"description": "Invalid date range"}
    }
)
async def get_activity_report(
    start_date: Optional[datetime] = Query(None, description="Start date of the reporting period (inclusive)"),
    end_date: Optional[datetime] = Query(None, description="End date of the reporting period (inclusive)"),
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
) -> ActivityReportResponse:
    """Generate activity report for the association.
    
    Validates Requirements 8.4:
    - Generates annual activity reports accessible to all members
    - Calculates statistics including new members, active members, events, forum activity, and revenue
    - Supports date range filtering
    
    If no date range is provided, defaults to the current calendar year.
    
    Args:
        start_date: Optional start date of the reporting period (inclusive)
        end_date: Optional end date of the reporting period (inclusive)
        current_user: Authenticated administrator
        db: Database session
        
    Returns:
        ActivityReportResponse with calculated statistics
        
    Raises:
        HTTPException 403: If user is not an administrator
        HTTPException 400: If date range is invalid (end_date before start_date)
    """
    # Default to current calendar year if no dates provided
    now = datetime.now(timezone.utc)
    if start_date is None:
        start_date = datetime(now.year, 1, 1, tzinfo=timezone.utc)
    else:
        # Ensure timezone-aware
        if start_date.tzinfo is None:
            start_date = start_date.replace(tzinfo=timezone.utc)
    
    if end_date is None:
        end_date = datetime(now.year, 12, 31, 23, 59, 59, tzinfo=timezone.utc)
    else:
        # Ensure timezone-aware
        if end_date.tzinfo is None:
            end_date = end_date.replace(tzinfo=timezone.utc)
    
    # Validate date range
    if end_date < start_date:
        logger.warning(
            f"Administrator {current_user.id} provided invalid date range: "
            f"start={start_date}, end={end_date}"
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=ErrorResponse.create(
                code="INVALID_DATE_RANGE",
                message="End date must be after start date",
                details={
                    "start_date": start_date.isoformat(),
                    "end_date": end_date.isoformat()
                }
            )
        )
    
    # Calculate new members (registered during the period)
    new_members_count = db.query(User).filter(
        and_(
            User.created_at >= start_date,
            User.created_at <= end_date
        )
    ).count()
    
    # Calculate active members (membership not expired as of end_date)
    active_members_count = db.query(User).filter(
        and_(
            User.is_email_verified == True,
            User.membership_expires_at > end_date
        )
    ).count()
    
    # Calculate events held (events that occurred during the period)
    events_held_count = db.query(Event).filter(
        and_(
            Event.start_date >= start_date,
            Event.start_date <= end_date,
            Event.status == EventStatus.COMPLETED
        )
    ).count()
    
    # Calculate forum activity (topics and posts created during the period)
    topics_count = db.query(Topic).filter(
        and_(
            Topic.created_at >= start_date,
            Topic.created_at <= end_date
        )
    ).count()
    
    posts_count = db.query(Post).filter(
        and_(
            Post.created_at >= start_date,
            Post.created_at <= end_date
        )
    ).count()
    
    # Calculate revenue (completed payments during the period)
    from sqlalchemy import func
    revenue_result = db.query(func.sum(Payment.amount)).filter(
        and_(
            Payment.created_at >= start_date,
            Payment.created_at <= end_date,
            Payment.status == PaymentStatus.COMPLETED
        )
    ).scalar()
    
    # Handle None result (no payments)
    total_revenue = float(revenue_result) if revenue_result is not None else 0.0
    
    logger.info(
        f"Administrator {current_user.id} ({current_user.email}) generated activity report "
        f"for period {start_date.date()} to {end_date.date()}"
    )
    
    return ActivityReportResponse(
        period_start=start_date,
        period_end=end_date,
        new_members=new_members_count,
        active_members=active_members_count,
        events_held=events_held_count,
        forum_activity=ForumActivityStats(
            topics=topics_count,
            posts=posts_count
        ),
        revenue=total_revenue
    )



@router.post(
    "/announcements",
    response_model=AnnouncementResponse,
    status_code=status.HTTP_200_OK,
    responses={
        403: {"description": "Insufficient permissions - administrator role required"}
    }
)
@limiter.limit("10/hour")  # Limit announcements to prevent spam
async def send_announcement(
    request: Request,
    announcement_data: AnnouncementRequest,
    current_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
) -> AnnouncementResponse:
    """Send announcement to all active members with notifications enabled.
    
    Validates Requirement 10.5:
    - Administrator can send announcements to all active members by email
    - Respects user notification preferences
    - Only sends to members with active membership status and verified email
    
    Args:
        announcement_data: Announcement subject and content
        current_user: Authenticated administrator
        db: Database session
        
    Returns:
        AnnouncementResponse with number of notifications sent
        
    Raises:
        HTTPException 403: If user is not an administrator
    """
    logger.info(
        f"Administrator {current_user.id} ({current_user.email}) sending announcement: "
        f"{announcement_data.subject}"
    )
    
    # Get total number of active members (for reporting)
    total_active_members = db.query(User).filter(
        User.role.in_([UserRole.MEMBER, UserRole.ADMINISTRATOR]),
        User.is_email_verified == True
    ).count()
    
    # Send announcement using notification service
    notifications_sent = notification_service.send_announcement(
        db=db,
        subject=announcement_data.subject,
        content=announcement_data.content,
        sender_name=announcement_data.sender_name or "HYPERVISIA"
    )
    
    # Create audit log entry
    audit_entry = AuditLog(
        admin_id=current_user.id,
        action="send_announcement",
        target_type="announcement",
        target_id=None,
        details={
            "subject": announcement_data.subject,
            "content_preview": announcement_data.content[:100] if len(announcement_data.content) > 100 else announcement_data.content,
            "sender_name": announcement_data.sender_name or "HYPERVISIA",
            "notifications_sent": notifications_sent,
            "total_active_members": total_active_members
        }
    )
    db.add(audit_entry)
    db.commit()
    
    logger.info(
        f"Announcement sent by administrator {current_user.id}: "
        f"{notifications_sent}/{total_active_members} notifications delivered"
    )
    
    return AnnouncementResponse(
        success=True,
        message=f"Announcement sent successfully to {notifications_sent} members",
        notifications_sent=notifications_sent,
        total_members=total_active_members
    )

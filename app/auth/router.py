"""Authentication API endpoints"""
from fastapi import APIRouter, Depends, HTTPException, status, Request, Query
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from app.database import get_db
from app.models import User, UserRole, AuditLog, TokenBlacklist
from app.auth.schemas import (
    RegistrationRequest, 
    RegistrationResponse, 
    LoginRequest,
    LoginResponse,
    LogoutResponse,
    EmailVerificationRequest,
    EmailVerificationResponse,
    PasswordResetRequest,
    PasswordResetConfirm,
    ErrorResponse
)
from app.auth.password import hash_password, verify_password
from app.auth.token import create_access_token, verify_token
from app.auth.rate_limiter import login_rate_limiter
from app.auth.dependencies import get_current_user, get_token_from_request
from app.services.email import email_service
from app.logging_config import logger
from app.middleware.rate_limit import limiter
from datetime import timedelta, datetime, timezone

router = APIRouter(prefix="/api/auth", tags=["authentication"])


@router.post(
    "/register",
    response_model=RegistrationResponse,
    status_code=status.HTTP_201_CREATED,
    responses={
        409: {"description": "Email already registered"},
        400: {"description": "Invalid registration data"}
    }
)
@limiter.limit("10/hour")  # Limit registration to 10 attempts per hour per IP
async def register(
    request: Request,
    registration_data: RegistrationRequest,
    db: Session = Depends(get_db)
) -> RegistrationResponse:
    """Register a new user account.
    
    Validates Requirements 2.1, 2.2, 2.7:
    - Creates new member account with valid registration data
    - Rejects duplicate email addresses
    - Enforces password complexity requirements
    - Sends email verification
    
    Args:
        registration_data: User registration information
        db: Database session
        
    Returns:
        RegistrationResponse with user details and success message
        
    Raises:
        HTTPException 409: If email is already registered
        HTTPException 400: If validation fails
    """
    try:
        # Check for duplicate email (Requirement 2.2)
        existing_user = db.query(User).filter(User.email == registration_data.email).first()
        if existing_user:
            logger.warning(f"Registration attempt with duplicate email: {registration_data.email}")
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="An account with this email address already exists"
            )
        
        # Hash password (Requirement 9.1)
        password_hash = hash_password(registration_data.password)
        
        # Create user record (Requirement 2.1)
        new_user = User(
            email=registration_data.email,
            password_hash=password_hash,
            first_name=registration_data.first_name,
            last_name=registration_data.last_name,
            role=UserRole.MEMBER,
            is_email_verified=False  # Requirement 2.6
        )
        
        db.add(new_user)
        db.commit()
        db.refresh(new_user)
        
        logger.info(f"New user registered: {new_user.email} (ID: {new_user.id})")
        
        # Generate verification token (Requirement 2.6)
        verification_token = create_access_token(
            data={"sub": str(new_user.id), "type": "email_verification"},
            expires_delta=timedelta(hours=24)  # Token valid for 24 hours
        )
        
        # Send verification email (Requirement 2.6)
        email_sent = email_service.send_verification_email(
            to_email=new_user.email,
            verification_token=verification_token,
            user_name=new_user.first_name
        )
        
        if not email_sent:
            logger.warning(f"Failed to send verification email to {new_user.email}")
            # Don't fail registration if email fails - user can request resend
        
        # Return success response
        return RegistrationResponse(
            id=str(new_user.id),
            email=new_user.email,
            first_name=new_user.first_name,
            last_name=new_user.last_name
        )
        
    except HTTPException:
        # Re-raise HTTP exceptions
        raise
    except IntegrityError as e:
        # Handle database constraint violations
        db.rollback()
        logger.error(f"Database integrity error during registration: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email address already exists"
        )
    except ValueError as e:
        # Handle validation errors (e.g., password too long for bcrypt)
        logger.error(f"Validation error during registration: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        # Handle unexpected errors
        db.rollback()
        logger.error(f"Unexpected error during registration: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="An unexpected error occurred during registration"
        )


@router.post(
    "/login",
    response_model=LoginResponse,
    status_code=status.HTTP_200_OK,
    responses={
        401: {"description": "Invalid credentials or email not verified"},
        429: {"description": "Too many login attempts"},
        400: {"description": "Invalid login data"}
    }
)
@limiter.limit("20/hour")  # Additional IP-based rate limiting (20 attempts per hour)
async def login(
    request: Request,
    login_data: LoginRequest,
    db: Session = Depends(get_db)
) -> LoginResponse:
    """Authenticate user and generate JWT token.
    
    Validates Requirements 2.3, 2.4, 2.6, 9.6:
    - Authenticates member with valid credentials
    - Rejects invalid credentials
    - Checks email verification status
    - Logs authentication attempts
    - Implements rate limiting (5 attempts per 15 minutes)
    
    Args:
        login_data: User login credentials
        db: Database session
        
    Returns:
        LoginResponse with JWT token and user details
        
    Raises:
        HTTPException 401: If credentials are invalid or email not verified
        HTTPException 429: If rate limit exceeded
        HTTPException 400: If validation fails
    """
    try:
        # Check rate limiting (Requirement 9.6)
        is_limited, remaining = login_rate_limiter.is_rate_limited(login_data.email)
        if is_limited:
            logger.warning(f"Rate limit exceeded for login attempt: {login_data.email}")
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=ErrorResponse.create(
                    code="RATE_LIMIT_EXCEEDED",
                    message="Too many login attempts. Please try again in 15 minutes.",
                    details={"email": login_data.email}
                )
            )
        
        # Find user by email
        user = db.query(User).filter(User.email == login_data.email).first()
        
        # Verify credentials (Requirement 2.3, 2.4)
        if not user or not verify_password(login_data.password, user.password_hash):
            # Record failed attempt
            login_rate_limiter.record_attempt(login_data.email)
            
            # Log failed authentication attempt (Requirement 9.6)
            audit_log = AuditLog(
                admin_id=user.id if user else None,
                action="LOGIN_FAILED",
                target_type="user",
                target_id=user.id if user else None,
                details={
                    "email": login_data.email,
                    "reason": "invalid_credentials",
                    "remaining_attempts": remaining - 1
                }
            )
            db.add(audit_log)
            db.commit()
            
            logger.warning(f"Failed login attempt for: {login_data.email}")
            
            # Return generic error message (don't reveal if email exists)
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=ErrorResponse.create(
                    code="INVALID_CREDENTIALS",
                    message="Invalid email or password",
                    details={}
                )
            )
        
        # Check email verification status (Requirement 2.6)
        if not user.is_email_verified:
            # Record failed attempt
            login_rate_limiter.record_attempt(login_data.email)
            
            # Log failed authentication attempt
            audit_log = AuditLog(
                admin_id=user.id,
                action="LOGIN_FAILED",
                target_type="user",
                target_id=user.id,
                details={
                    "email": login_data.email,
                    "reason": "email_not_verified"
                }
            )
            db.add(audit_log)
            db.commit()
            
            logger.warning(f"Login attempt with unverified email: {login_data.email}")
            
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=ErrorResponse.create(
                    code="EMAIL_NOT_VERIFIED",
                    message="Please verify your email address before logging in",
                    details={"email": login_data.email}
                )
            )
        
        # Generate JWT token (Requirement 2.3)
        access_token = create_access_token(
            data={
                "sub": str(user.id),
                "email": user.email,
                "role": user.role.value
            }
        )
        
        # Reset rate limiter on successful login
        login_rate_limiter.reset(login_data.email)
        
        # Log successful authentication attempt (Requirement 9.6)
        audit_log = AuditLog(
            admin_id=user.id,
            action="LOGIN_SUCCESS",
            target_type="user",
            target_id=user.id,
            details={
                "email": login_data.email
            }
        )
        db.add(audit_log)
        db.commit()
        
        logger.info(f"Successful login: {user.email} (ID: {user.id})")
        
        # Return success response with token
        return LoginResponse(
            access_token=access_token,
            token_type="bearer",
            user={
                "id": str(user.id),
                "email": user.email,
                "first_name": user.first_name,
                "last_name": user.last_name,
                "role": user.role.value,
                "is_email_verified": user.is_email_verified
            }
        )
        
    except HTTPException:
        # Re-raise HTTP exceptions
        raise
    except Exception as e:
        # Handle unexpected errors
        logger.error(f"Unexpected error during login: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=ErrorResponse.create(
                code="INTERNAL_ERROR",
                message="An unexpected error occurred during login",
                details={}
            )
        )



@router.post(
    "/logout",
    response_model=LogoutResponse,
    status_code=status.HTTP_200_OK,
    responses={
        401: {"description": "Invalid or expired token"},
        400: {"description": "Invalid request"}
    }
)
async def logout(
    token: str = Depends(get_token_from_request),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
) -> LogoutResponse:
    """Logout user and invalidate their JWT token.
    
    Validates Requirement 2.5:
    - Terminates the session by adding the token to a blacklist
    - Prevents the token from being used again
    - Logs the logout action in the audit log
    
    Args:
        token: The JWT token to invalidate (extracted from Authorization header)
        current_user: The authenticated user (from token validation)
        db: Database session
        
    Returns:
        LogoutResponse with success message
        
    Raises:
        HTTPException 401: If token is invalid or already revoked
        HTTPException 400: If request is malformed
    """
    try:
        # Verify token and extract expiration
        payload = verify_token(token)
        if not payload:
            logger.warning(f"Logout attempt with invalid token")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=ErrorResponse.create(
                    code="INVALID_TOKEN",
                    message="Invalid or expired token",
                    details={}
                )
            )
        
        # Extract expiration time from token
        exp_timestamp = payload.get("exp")
        if not exp_timestamp:
            logger.warning(f"Token missing expiration claim")
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail=ErrorResponse.create(
                    code="INVALID_TOKEN",
                    message="Invalid token format",
                    details={}
                )
            )
        
        expires_at = datetime.fromtimestamp(exp_timestamp, tz=timezone.utc)
        
        # Check if token is already blacklisted
        existing_blacklist = db.query(TokenBlacklist).filter(
            TokenBlacklist.token == token
        ).first()
        
        if existing_blacklist:
            logger.info(f"Token already blacklisted for user: {current_user.email}")
            # Return success anyway (idempotent operation)
            return LogoutResponse(message="Logout successful")
        
        # Add token to blacklist (Requirement 2.5)
        blacklist_entry = TokenBlacklist(
            token=token,
            user_id=current_user.id,
            revoked_at=datetime.now(timezone.utc),
            expires_at=expires_at
        )
        
        db.add(blacklist_entry)
        
        # Log logout action in audit log
        audit_log = AuditLog(
            admin_id=current_user.id,
            action="LOGOUT",
            target_type="user",
            target_id=current_user.id,
            details={
                "email": current_user.email,
                "token_expires_at": expires_at.isoformat()
            }
        )
        
        db.add(audit_log)
        db.commit()
        
        logger.info(f"User logged out successfully: {current_user.email} (ID: {current_user.id})")
        
        return LogoutResponse(message="Logout successful")
        
    except HTTPException:
        # Re-raise HTTP exceptions
        raise
    except Exception as e:
        # Handle unexpected errors
        db.rollback()
        logger.error(f"Unexpected error during logout: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=ErrorResponse.create(
                code="INTERNAL_ERROR",
                message="An unexpected error occurred during logout",
                details={}
            )
        )



@router.post(
    "/verify-email",
    response_model=EmailVerificationResponse,
    status_code=status.HTTP_200_OK,
    responses={
        400: {"description": "Invalid or expired verification token"},
        404: {"description": "User not found"},
        409: {"description": "Email already verified"}
    }
)
@limiter.limit("10/hour")  # Limit email verification attempts
async def verify_email(
    request: Request,
    verification_data: EmailVerificationRequest,
    db: Session = Depends(get_db)
) -> EmailVerificationResponse:
    """Verify user's email address using verification token.
    
    Validates Requirement 2.6:
    - Verifies token and activates account
    - Allows user to login after verification
    
    Args:
        verification_data: Contains the verification token
        db: Database session
        
    Returns:
        EmailVerificationResponse with success message
        
    Raises:
        HTTPException 400: If token is invalid or expired
        HTTPException 404: If user not found
        HTTPException 409: If email already verified
    """
    return await _verify_email_logic(verification_data.token, db)


@router.get(
    "/verify-email",
    response_model=EmailVerificationResponse,
    status_code=status.HTTP_200_OK,
    responses={
        400: {"description": "Invalid or expired verification token"},
        404: {"description": "User not found"},
        409: {"description": "Email already verified"}
    }
)
@limiter.limit("10/hour")
async def verify_email_get(
    request: Request,
    token: str = Query(..., description="Email verification token"),
    db: Session = Depends(get_db)
) -> EmailVerificationResponse:
    """Verify user's email address using verification token from query parameter."""
    return await _verify_email_logic(token, db)


async def _verify_email_logic(token: str, db: Session) -> EmailVerificationResponse:
    """Verify user's email address using verification token - shared logic."""
    try:
        # Verify and decode token
        payload = verify_token(token)
        if not payload:
            logger.warning(f"Email verification attempt with invalid token")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=ErrorResponse.create(
                    code="INVALID_TOKEN",
                    message="Invalid or expired verification token",
                    details={}
                )
            )
        
        # Check token type
        token_type = payload.get("type")
        if token_type != "email_verification":
            logger.warning(f"Email verification attempt with wrong token type: {token_type}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=ErrorResponse.create(
                    code="INVALID_TOKEN",
                    message="Invalid verification token",
                    details={}
                )
            )
        
        # Extract user ID from token
        user_id: Optional[str] = payload.get("sub")
        if not user_id:
            logger.warning(f"Verification token missing user ID")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=ErrorResponse.create(
                    code="INVALID_TOKEN",
                    message="Invalid token format",
                    details={}
                )
            )
        
        # Convert user_id string to UUID
        try:
            from uuid import UUID
            user_uuid = UUID(user_id)
        except (ValueError, AttributeError):
            logger.warning(f"Invalid user ID format in verification token: {user_id}")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=ErrorResponse.create(
                    code="INVALID_TOKEN",
                    message="Invalid token format",
                    details={}
                )
            )
        
        # Fetch user from database
        user = db.query(User).filter(User.id == user_uuid).first()
        if not user:
            logger.warning(f"User not found for verification token: {user_id}")
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=ErrorResponse.create(
                    code="USER_NOT_FOUND",
                    message="User not found",
                    details={}
                )
            )
        
        # Check if email is already verified
        if user.is_email_verified:
            logger.info(f"Email already verified for user: {user.email}")
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=ErrorResponse.create(
                    code="EMAIL_ALREADY_VERIFIED",
                    message="Email address is already verified",
                    details={"email": user.email}
                )
            )
        
        # Activate account by setting is_email_verified to True
        user.is_email_verified = True
        user.updated_at = datetime.now(timezone.utc)
        
        # Log verification action in audit log
        audit_log = AuditLog(
            admin_id=user.id,
            action="EMAIL_VERIFIED",
            target_type="user",
            target_id=user.id,
            details={
                "email": user.email
            }
        )
        
        db.add(audit_log)
        db.commit()
        db.refresh(user)
        
        logger.info(f"Email verified successfully for user: {user.email} (ID: {user.id})")
        
        return EmailVerificationResponse(
            email=user.email
        )
        
    except HTTPException:
        # Re-raise HTTP exceptions
        raise
    except Exception as e:
        # Handle unexpected errors
        db.rollback()
        logger.error(f"Unexpected error during email verification: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=ErrorResponse.create(
                code="INTERNAL_ERROR",
                message="An unexpected error occurred during email verification",
                details={}
            )
        )


@router.post("/password-reset", status_code=status.HTTP_200_OK)
@limiter.limit("5/hour")
async def request_password_reset(
    request: Request,
    reset_data: PasswordResetRequest,
    db: Session = Depends(get_db)
):
    """Request password reset email."""
    user = db.query(User).filter(User.email == reset_data.email).first()
    
    # Always return success to prevent email enumeration
    if not user:
        logger.info(f"Password reset requested for non-existent email: {reset_data.email}")
        return {"message": "Si cet email existe, un lien de réinitialisation a été envoyé."}
    
    # Generate reset token
    reset_token = create_access_token(
        data={"sub": str(user.id), "type": "password_reset"},
        expires_delta=timedelta(hours=1)
    )
    
    # Send reset email
    email_sent = email_service.send_password_reset_email(
        to_email=user.email,
        reset_token=reset_token,
        user_name=user.first_name
    )
    
    if email_sent:
        logger.info(f"Password reset email sent to {user.email}")
    else:
        logger.warning(f"Failed to send password reset email to {user.email}")
    
    return {"message": "Si cet email existe, un lien de réinitialisation a été envoyé."}


@router.post("/password-reset/confirm", status_code=status.HTTP_200_OK)
@limiter.limit("5/hour")
async def confirm_password_reset(
    request: Request,
    reset_data: PasswordResetConfirm,
    db: Session = Depends(get_db)
):
    """Confirm password reset with token."""
    payload = verify_token(reset_data.token)
    if not payload or payload.get("type") != "password_reset":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=ErrorResponse.create(
                code="INVALID_TOKEN",
                message="Invalid or expired reset token",
                details={}
            )
        )
    
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=ErrorResponse.create(
                code="INVALID_TOKEN",
                message="Invalid token format",
                details={}
            )
        )
    
    from uuid import UUID
    try:
        user_uuid = UUID(user_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=ErrorResponse.create(
                code="INVALID_TOKEN",
                message="Invalid token format",
                details={}
            )
        )
    
    user = db.query(User).filter(User.id == user_uuid).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=ErrorResponse.create(
                code="USER_NOT_FOUND",
                message="User not found",
                details={}
            )
        )
    
    # Update password
    user.password_hash = hash_password(reset_data.new_password)
    user.updated_at = datetime.now(timezone.utc)
    
    # Log password reset
    audit_log = AuditLog(
        admin_id=user.id,
        action="PASSWORD_RESET",
        target_type="user",
        target_id=user.id,
        details={"email": user.email}
    )
    db.add(audit_log)
    db.commit()
    
    logger.info(f"Password reset successful for user: {user.email}")
    
    return {"message": "Mot de passe réinitialisé avec succès."}

"""Database models for OPCP application"""
from app.models.user import User, UserRole
from app.models.forum import Topic, Post
from app.models.payment import Payment, PaymentMethod, PaymentStatus
from app.models.document import (
    Document,
    DocumentCategory,
    AccessLevel,
    CATEGORY_MAPPING,
    classify_extension,
)
from app.models.event import Event, EventRegistration, EventStatus, EventAssignment
from app.models.notification import Notification, NotificationPreferences, NotificationType
from app.models.audit import AuditLog
from app.models.token_blacklist import TokenBlacklist
from app.models.user_deletion import ScheduledUserDeletion
from app.models.prerequisite import PrerequisiteContent, PrerequisiteAnswer
from app.models.installation import Installation
from app.models.credential_config import CredentialConfig
from app.models.ai_provider_config import (
    AIProviderConfig,
    AI_PROVIDER_IDS,
    ALWAYS_ENABLED_PROVIDER,
    DEFAULT_PROVIDER_ENABLED,
)

__all__ = [
    "User", "UserRole",
    "Topic", "Post",
    "Payment", "PaymentMethod", "PaymentStatus",
    "Document", "DocumentCategory", "AccessLevel",
    "CATEGORY_MAPPING", "classify_extension",
    "Event", "EventRegistration", "EventStatus", "EventAssignment",
    "Notification", "NotificationPreferences", "NotificationType",
    "AuditLog",
    "TokenBlacklist",
    "ScheduledUserDeletion",
    "PrerequisiteContent", "PrerequisiteAnswer",
    "Installation",
    "CredentialConfig",
    "AIProviderConfig",
    "AI_PROVIDER_IDS",
    "ALWAYS_ENABLED_PROVIDER",
    "DEFAULT_PROVIDER_ENABLED",
]
from app.models.oracle import OracleQuery

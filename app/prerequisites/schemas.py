"""Pydantic schemas for OPCP prerequisites endpoints

Bugfix: basics-prerequisites-404-fix
Validates Requirements 2.1, 2.3, 2.4

These schemas match the exact request/response shapes the frontend
``prerequisitesService.ts`` already sends and expects:

- ``StaticContentResponse``  -> ``{ slug, content, updated_at? }``
- ``StaticContentUpdateRequest`` (PUT body) -> ``{ content }``
- ``ClientAnswersResponse``   -> ``{ slug, answers }`` (``answers`` keyed by ``row_id``)
- ``ClientAnswerUpdateRequest`` (PUT body) -> ``{ answer }``

Error bodies reuse ``ErrorResponse`` from ``app.auth.schemas`` (imported here so
callers/routers get a single, consistent error contract) and are NOT redefined.
"""
from datetime import datetime
from typing import Optional

from pydantic import BaseModel

# Re-export the shared error schema so error bodies stay consistent with the
# other routers. Do NOT redefine ErrorResponse here.
from app.auth.schemas import ErrorResponse

__all__ = [
    "StaticContentResponse",
    "StaticContentUpdateRequest",
    "ClientAnswersResponse",
    "ClientAnswerUpdateRequest",
    "PrerequisiteUpdateResponse",
    "ErrorResponse",
]


class StaticContentResponse(BaseModel):
    """Response schema for static prerequisites content (e.g. Basics, Network Flux).

    Matches the frontend ``StaticContentResponse`` interface:
    ``{ slug: string, content: string, updated_at?: string }``.
    """
    slug: str
    content: str
    updated_at: Optional[datetime] = None

    model_config = {
        "from_attributes": True
    }


class StaticContentUpdateRequest(BaseModel):
    """Request schema for saving static prerequisites content.

    Matches the frontend PUT body ``{ content }``.
    """
    content: str


class ClientAnswersResponse(BaseModel):
    """Response schema for a slug's client answers.

    Matches the frontend ``ClientAnswersResponse`` interface:
    ``{ slug: string, answers: Record<string, string> }``. The ``answers`` map
    is keyed by ``row_id``.
    """
    slug: str
    answers: dict[str, str]

    model_config = {
        "from_attributes": True
    }


class ClientAnswerUpdateRequest(BaseModel):
    """Request schema for saving a single client answer.

    Matches the frontend PUT body ``{ answer }``.
    """
    answer: str


class PrerequisiteUpdateResponse(BaseModel):
    """Response schema for successful PUT (upsert) operations."""
    success: bool
    slug: str

    model_config = {
        "from_attributes": True
    }

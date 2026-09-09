"""OPCP prerequisites API endpoints

Bugfix: basics-prerequisites-404-fix

Mounts the previously-missing ``/api/prerequisites/*`` route family so the
frontend ``prerequisitesService.ts`` no longer receives unmatched-route 404s.

Validates Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 3.4:
- Serves static content GET/PUT and client-answer GET/PUT for known slugs
- Returns a resource-specific (structured) 404 for unknown slugs instead of the
  framework default ``{"detail": "Not Found"}``
- Reuses the existing auth dependencies so auth behavior matches other routers
"""
import logging

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User, UserRole
from app.models.prerequisite import PrerequisiteContent, PrerequisiteAnswer
from app.auth.dependencies import get_current_user
from app.forum.dependencies import get_administrator
from app.prerequisites.schemas import (
    StaticContentResponse,
    StaticContentUpdateRequest,
    ClientAnswersResponse,
    ClientAnswerUpdateRequest,
    PrerequisiteUpdateResponse,
)
from app.auth.schemas import ErrorResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/prerequisites", tags=["prerequisites"])

# Known slug sets, kept in sync with the frontend PREREQ_NAV_ITEMS.
# Static slugs render editable static content; qa slugs render question/answer forms.
STATIC_SLUGS: frozenset[str] = frozenset({"basics", "network-flux"})
QA_SLUGS: frozenset[str] = frozenset(
    {"network-checklist", "core-control-plane", "cloudstore", "vcf"}
)


def _slug_not_found(slug: str) -> HTTPException:
    """Build the structured, resource-specific 404 for an unknown slug.

    This intentionally differs from FastAPI's default unmatched-route
    ``{"detail": "Not Found"}`` body: the route IS served, but the requested
    slug is not a recognized prerequisite resource.
    """
    return HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail=ErrorResponse.create(
            code="PREREQUISITE_SLUG_NOT_FOUND",
            message="Unknown prerequisite slug",
            details={"slug": slug},
        ),
    )


async def get_answering_member(
    current_user: User = Depends(get_current_user),
) -> User:
    """Authorize a user to save client answers.

    Mirrors the frontend ``canAnswer`` gate: administrators manage static
    content but do NOT submit client answers. Any authenticated non-admin user
    may answer. This mirrors the ``get_verified_member`` dependency pattern.

    Raises:
        HTTPException 403: If the current user is an administrator
    """
    if current_user.role == UserRole.ADMINISTRATOR:
        logger.warning(
            f"Administrator {current_user.id} attempted to submit a client answer"
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=ErrorResponse.create(
                code="ANSWER_NOT_ALLOWED_FOR_ADMIN",
                message="Administrators cannot submit client answers",
                details={"current_role": current_user.role.value},
            ),
        )
    return current_user


@router.get(
    "/{slug}/content",
    response_model=StaticContentResponse,
    summary="Get static prerequisite content by slug",
)
async def get_static_content(
    slug: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> StaticContentResponse:
    """Return the persisted static content for a known static slug.

    Returns an empty-content default for a known static slug that has never
    been saved. Unknown slugs return a resource-specific 404.
    """
    if slug not in STATIC_SLUGS:
        logger.warning(f"Unknown static prerequisite slug requested: {slug}")
        raise _slug_not_found(slug)

    row = (
        db.query(PrerequisiteContent)
        .filter(PrerequisiteContent.slug == slug)
        .first()
    )

    if row is None:
        # Known static slug never saved -> empty-content default.
        return StaticContentResponse(slug=slug, content="", updated_at=None)

    return StaticContentResponse.model_validate(row)


@router.put(
    "/{slug}/content",
    response_model=PrerequisiteUpdateResponse,
    summary="Save static prerequisite content by slug (admin only)",
)
async def update_static_content(
    slug: str,
    payload: StaticContentUpdateRequest,
    current_user: User = Depends(get_administrator),
    db: Session = Depends(get_db),
) -> PrerequisiteUpdateResponse:
    """Upsert the static content row for a known static slug (admin only)."""
    if slug not in STATIC_SLUGS:
        logger.warning(f"Unknown static prerequisite slug on save: {slug}")
        raise _slug_not_found(slug)

    try:
        row = (
            db.query(PrerequisiteContent)
            .filter(PrerequisiteContent.slug == slug)
            .first()
        )

        if row is None:
            row = PrerequisiteContent(
                slug=slug,
                content=payload.content,
                updated_by=current_user.id,
            )
            db.add(row)
        else:
            row.content = payload.content
            row.updated_by = current_user.id

        db.commit()
        db.refresh(row)

        logger.info(f"Static prerequisite content saved for slug={slug}")
        return PrerequisiteUpdateResponse(success=True, slug=slug)

    except Exception as e:  # pragma: no cover - defensive DB error path
        db.rollback()
        logger.error(
            f"Failed to save static prerequisite content for slug={slug}: {e}",
            exc_info=True,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=ErrorResponse.create(
                code="DATABASE_ERROR",
                message="Failed to save prerequisite content",
                details={"error": str(e)},
            ),
        )


@router.get(
    "/{slug}/answers",
    response_model=ClientAnswersResponse,
    summary="Get client answers for a slug",
)
async def get_answers(
    slug: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ClientAnswersResponse:
    """Return the ``{ row_id: answer }`` map for a known qa slug (empty when none)."""
    if slug not in QA_SLUGS:
        logger.warning(f"Unknown qa prerequisite slug requested: {slug}")
        raise _slug_not_found(slug)

    rows = (
        db.query(PrerequisiteAnswer)
        .filter(PrerequisiteAnswer.slug == slug)
        .all()
    )

    answers = {row.row_id: row.answer for row in rows}
    return ClientAnswersResponse(slug=slug, answers=answers)


@router.put(
    "/{slug}/answers/{row_id}",
    response_model=PrerequisiteUpdateResponse,
    summary="Save a single client answer (members only)",
)
async def update_answer(
    slug: str,
    row_id: str,
    payload: ClientAnswerUpdateRequest,
    current_user: User = Depends(get_answering_member),
    db: Session = Depends(get_db),
) -> PrerequisiteUpdateResponse:
    """Upsert the ``(slug, row_id)`` answer row for a known qa slug (members only)."""
    if slug not in QA_SLUGS:
        logger.warning(f"Unknown qa prerequisite slug on save: {slug}")
        raise _slug_not_found(slug)

    try:
        row = (
            db.query(PrerequisiteAnswer)
            .filter(
                PrerequisiteAnswer.slug == slug,
                PrerequisiteAnswer.row_id == row_id,
            )
            .first()
        )

        if row is None:
            row = PrerequisiteAnswer(
                slug=slug,
                row_id=row_id,
                answer=payload.answer,
                updated_by=current_user.id,
            )
            db.add(row)
        else:
            row.answer = payload.answer
            row.updated_by = current_user.id

        db.commit()
        db.refresh(row)

        logger.info(
            f"Client answer saved for slug={slug}, row_id={row_id}"
        )
        return PrerequisiteUpdateResponse(success=True, slug=slug)

    except Exception as e:  # pragma: no cover - defensive DB error path
        db.rollback()
        logger.error(
            f"Failed to save client answer for slug={slug}, row_id={row_id}: {e}",
            exc_info=True,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=ErrorResponse.create(
                code="DATABASE_ERROR",
                message="Failed to save prerequisite answer",
                details={"error": str(e)},
            ),
        )

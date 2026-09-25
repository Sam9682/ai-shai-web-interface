"""OPCP prerequisites API endpoints

Feature: vcf-prerequisites-update (installation-scoped)

Mounts the ``/api/prerequisites/*`` route family so the frontend
``prerequisitesService.ts`` contract is satisfied. This module now exposes:

- Installations CRUD (``/installations`` and ``/installations/{installation_id}``)
- Installation-scoped static content
  (``/installations/{installation_id}/{slug}/content``)
- Installation-scoped client answers
  (``/installations/{installation_id}/{slug}/answers[/{row_id}]``)

The prior single-instance ``/{slug}/content`` and ``/{slug}/answers`` routes were
intentionally re-scoped under an installation by the parent spec
``multi-instance-opcp-prerequisites`` and are removed here.

Validates Requirements 6.1-6.7, 7.1-7.7, 8.1-8.4:
- Serves installations CRUD (list/create/update/delete) with admin-only mutations
- Serves installation-scoped static content GET/PUT and client-answer GET/PUT
- Answers are shared per installation (no ``user_id`` scoping), last-write-wins
- Returns a structured 404 for unknown installations (``INSTALLATION_NOT_FOUND``)
  and unknown slugs (``PREREQUISITE_SLUG_NOT_FOUND``)
- Reuses the existing auth dependencies so auth behavior matches other routers
"""
import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import User, UserRole
from app.models.installation import Installation
from app.models.prerequisite import PrerequisiteContent, PrerequisiteAnswer
from app.auth.dependencies import get_current_user
from app.forum.dependencies import get_administrator
from app.prerequisites.schemas import (
    StaticContentResponse,
    StaticContentUpdateRequest,
    ClientAnswersResponse,
    ClientAnswerUpdateRequest,
    PrerequisiteUpdateResponse,
    InstallationCreateRequest,
    InstallationUpdateRequest,
    InstallationResponse,
    InstallationListResponse,
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


def _get_installation_or_404(db: Session, installation_id: UUID) -> Installation:
    """Load the Installation by id or raise a structured 404.

    Raises:
        HTTPException 404: with an ``INSTALLATION_NOT_FOUND`` structured body
            when no Installation matches ``installation_id``.
    """
    installation = (
        db.query(Installation)
        .filter(Installation.id == installation_id)
        .first()
    )
    if installation is None:
        logger.warning(f"Unknown installation requested: {installation_id}")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=ErrorResponse.create(
                code="INSTALLATION_NOT_FOUND",
                message="Unknown installation",
                details={"installation_id": str(installation_id)},
            ),
        )
    return installation


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


# ---------------------------------------------------------------------------
# Installations CRUD (task 4.1)
# ---------------------------------------------------------------------------


@router.get(
    "/installations",
    response_model=InstallationListResponse,
    summary="List all installations",
)
async def list_installations(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> InstallationListResponse:
    """Return every Installation as ``{"installations": [...]}``."""
    rows = db.query(Installation).order_by(Installation.created_at).all()
    return InstallationListResponse(installations=rows)


@router.post(
    "/installations",
    response_model=InstallationResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create an installation (admin only)",
)
async def create_installation(
    payload: InstallationCreateRequest,
    current_user: User = Depends(get_administrator),
    db: Session = Depends(get_db),
) -> InstallationResponse:
    """Create a new Installation, recording ``created_by`` (admin only)."""
    try:
        installation = Installation(
            project_name=payload.project_name,
            created_by=current_user.id,
            updated_by=current_user.id,
        )
        db.add(installation)
        db.commit()
        db.refresh(installation)

        logger.info(f"Installation created: id={installation.id}")
        return InstallationResponse.model_validate(installation)

    except Exception as e:  # pragma: no cover - defensive DB error path
        db.rollback()
        logger.error(f"Failed to create installation: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=ErrorResponse.create(
                code="DATABASE_ERROR",
                message="Failed to create installation",
                details={"error": str(e)},
            ),
        )


@router.put(
    "/installations/{installation_id}",
    response_model=InstallationResponse,
    summary="Update an installation (admin only)",
)
async def update_installation(
    installation_id: UUID,
    payload: InstallationUpdateRequest,
    current_user: User = Depends(get_administrator),
    db: Session = Depends(get_db),
) -> InstallationResponse:
    """Update an existing Installation's ``project_name`` (admin only)."""
    installation = _get_installation_or_404(db, installation_id)

    try:
        installation.project_name = payload.project_name
        installation.updated_by = current_user.id
        db.commit()
        db.refresh(installation)

        logger.info(f"Installation updated: id={installation.id}")
        return InstallationResponse.model_validate(installation)

    except Exception as e:  # pragma: no cover - defensive DB error path
        db.rollback()
        logger.error(
            f"Failed to update installation id={installation_id}: {e}",
            exc_info=True,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=ErrorResponse.create(
                code="DATABASE_ERROR",
                message="Failed to update installation",
                details={"error": str(e)},
            ),
        )


@router.delete(
    "/installations/{installation_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete an installation (admin only)",
)
async def delete_installation(
    installation_id: UUID,
    current_user: User = Depends(get_administrator),
    db: Session = Depends(get_db),
) -> None:
    """Delete an Installation and cascade its content and answers (admin only)."""
    installation = _get_installation_or_404(db, installation_id)

    try:
        db.delete(installation)
        db.commit()
        logger.info(f"Installation deleted: id={installation_id}")
    except Exception as e:  # pragma: no cover - defensive DB error path
        db.rollback()
        logger.error(
            f"Failed to delete installation id={installation_id}: {e}",
            exc_info=True,
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=ErrorResponse.create(
                code="DATABASE_ERROR",
                message="Failed to delete installation",
                details={"error": str(e)},
            ),
        )


# ---------------------------------------------------------------------------
# Installation-scoped static content (task 5.1)
# ---------------------------------------------------------------------------


@router.get(
    "/installations/{installation_id}/{slug}/content",
    response_model=StaticContentResponse,
    summary="Get static prerequisite content for an installation and slug",
)
async def get_static_content(
    installation_id: UUID,
    slug: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> StaticContentResponse:
    """Return the persisted static content for an installation and known static slug.

    Returns an empty-content default for a known static slug that has never been
    saved under the installation. Unknown installations return
    ``INSTALLATION_NOT_FOUND``; unknown slugs return ``PREREQUISITE_SLUG_NOT_FOUND``.
    """
    _get_installation_or_404(db, installation_id)

    if slug not in STATIC_SLUGS:
        logger.warning(f"Unknown static prerequisite slug requested: {slug}")
        raise _slug_not_found(slug)

    row = (
        db.query(PrerequisiteContent)
        .filter(
            PrerequisiteContent.installation_id == installation_id,
            PrerequisiteContent.slug == slug,
        )
        .first()
    )

    if row is None:
        # Known static slug never saved for this installation -> empty default.
        return StaticContentResponse(slug=slug, content="", updated_at=None)

    return StaticContentResponse.model_validate(row)


@router.put(
    "/installations/{installation_id}/{slug}/content",
    response_model=PrerequisiteUpdateResponse,
    summary="Save static prerequisite content for an installation and slug (admin only)",
)
async def update_static_content(
    installation_id: UUID,
    slug: str,
    payload: StaticContentUpdateRequest,
    current_user: User = Depends(get_administrator),
    db: Session = Depends(get_db),
) -> PrerequisiteUpdateResponse:
    """Upsert the static content row for an installation and known static slug (admin only).

    Upsert keys on ``(installation_id, slug)`` and records ``updated_by``.
    """
    _get_installation_or_404(db, installation_id)

    if slug not in STATIC_SLUGS:
        logger.warning(f"Unknown static prerequisite slug on save: {slug}")
        raise _slug_not_found(slug)

    try:
        row = (
            db.query(PrerequisiteContent)
            .filter(
                PrerequisiteContent.installation_id == installation_id,
                PrerequisiteContent.slug == slug,
            )
            .first()
        )

        if row is None:
            row = PrerequisiteContent(
                installation_id=installation_id,
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

        logger.info(
            f"Static prerequisite content saved for "
            f"installation_id={installation_id}, slug={slug}"
        )
        return PrerequisiteUpdateResponse(success=True, slug=slug)

    except Exception as e:  # pragma: no cover - defensive DB error path
        db.rollback()
        logger.error(
            f"Failed to save static prerequisite content for "
            f"installation_id={installation_id}, slug={slug}: {e}",
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


# ---------------------------------------------------------------------------
# Installation-scoped client answers (task 5.2)
# ---------------------------------------------------------------------------


@router.get(
    "/installations/{installation_id}/{slug}/answers",
    response_model=ClientAnswersResponse,
    summary="Get client answers for an installation and slug",
)
async def get_answers(
    installation_id: UUID,
    slug: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ClientAnswersResponse:
    """Return the ``{ row_id: answer }`` map for an installation and known qa slug.

    Answers are shared per installation (no ``user_id`` scoping). Unknown
    installations return ``INSTALLATION_NOT_FOUND``; unknown slugs return
    ``PREREQUISITE_SLUG_NOT_FOUND``.
    """
    _get_installation_or_404(db, installation_id)

    if slug not in QA_SLUGS:
        logger.warning(f"Unknown qa prerequisite slug requested: {slug}")
        raise _slug_not_found(slug)

    rows = (
        db.query(PrerequisiteAnswer)
        .filter(
            PrerequisiteAnswer.installation_id == installation_id,
            PrerequisiteAnswer.slug == slug,
        )
        .all()
    )

    answers = {row.row_id: row.answer for row in rows}
    return ClientAnswersResponse(slug=slug, answers=answers)


@router.put(
    "/installations/{installation_id}/{slug}/answers/{row_id}",
    response_model=PrerequisiteUpdateResponse,
    summary="Save a single client answer for an installation (members only)",
)
async def update_answer(
    installation_id: UUID,
    slug: str,
    row_id: str,
    payload: ClientAnswerUpdateRequest,
    current_user: User = Depends(get_answering_member),
    db: Session = Depends(get_db),
) -> PrerequisiteUpdateResponse:
    """Upsert the ``(installation_id, slug, row_id)`` answer row for a known qa slug.

    Answers are shared per installation (last-write-wins); ``updated_by`` records
    the last editor. Unknown installations return ``INSTALLATION_NOT_FOUND``;
    unknown slugs return ``PREREQUISITE_SLUG_NOT_FOUND`` (members only).
    """
    _get_installation_or_404(db, installation_id)

    if slug not in QA_SLUGS:
        logger.warning(f"Unknown qa prerequisite slug on save: {slug}")
        raise _slug_not_found(slug)

    try:
        row = (
            db.query(PrerequisiteAnswer)
            .filter(
                PrerequisiteAnswer.installation_id == installation_id,
                PrerequisiteAnswer.slug == slug,
                PrerequisiteAnswer.row_id == row_id,
            )
            .first()
        )

        if row is None:
            row = PrerequisiteAnswer(
                installation_id=installation_id,
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
            f"Client answer saved for installation_id={installation_id}, "
            f"slug={slug}, row_id={row_id}"
        )
        return PrerequisiteUpdateResponse(success=True, slug=slug)

    except Exception as e:  # pragma: no cover - defensive DB error path
        db.rollback()
        logger.error(
            f"Failed to save client answer for installation_id={installation_id}, "
            f"slug={slug}, row_id={row_id}: {e}",
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

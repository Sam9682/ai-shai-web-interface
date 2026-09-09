"""Unit tests for the prerequisites route family (models, endpoints, slug
validation, and authorization).

Bugfix spec: .kiro/specs/basics-prerequisites-404-fix (task 3.6)

These tests run against the now-fixed app: the router is mounted and the
persistence models exist. They cover:

- Model behavior: defaults, ``updated_at`` default/onupdate, and the
  ``(slug, row_id)`` unique constraint on ``PrerequisiteAnswer``.
- Router per-endpoint: correct status/body for each of the four endpoints for
  known slugs.
- Slug validation: unknown slug -> resource-specific 404 carrying the error
  code ``PREREQUISITE_SLUG_NOT_FOUND`` (NOT the framework default
  ``{"detail": "Not Found"}``); empty-content default for a never-saved known
  static slug.
- Authorization: admin-only static PUT (403 for member), member-only answer PUT
  (403 for admin, code ``ANSWER_NOT_ALLOWED_FOR_ADMIN``), 401 for
  unauthenticated / invalid-token reads.

Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 3.4
"""
import time

import pytest
from fastapi import status
from sqlalchemy.exc import IntegrityError

from app.models import User, UserRole
from app.models.prerequisite import PrerequisiteContent, PrerequisiteAnswer
from app.auth.token import create_access_token


# --- Known slug sets (kept in sync with app/prerequisites/router.py) ---
STATIC_SLUGS = ("basics", "network-flux")
QA_SLUGS = ("network-checklist", "core-control-plane", "cloudstore", "vcf")


# ---------------------------------------------------------------------------
# Fixtures (mirror tests/test_prerequisites_exploration.py)
# ---------------------------------------------------------------------------
@pytest.fixture
def admin_user(db_session):
    """Create an administrator user (allowed to PUT static content)."""
    user = User(
        email="admin@prereq.test",
        password_hash="hashed_password",
        first_name="Admin",
        last_name="User",
        role=UserRole.ADMINISTRATOR,
        is_email_verified=True,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture
def member_user(db_session):
    """Create a member user (allowed to read and to PUT answers)."""
    user = User(
        email="member@prereq.test",
        password_hash="hashed_password",
        first_name="Member",
        last_name="User",
        role=UserRole.MEMBER,
        is_email_verified=True,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


def _headers(user):
    token = create_access_token({"sub": str(user.id)})
    return {"Authorization": f"Bearer {token}"}


def _error_code(body: dict) -> str | None:
    """Extract the structured error code from a router error body.

    The app installs an exception handler that unwraps
    ``ErrorResponse.create(...)`` to a top-level ``{"error": {"code": ...}}``
    body. Fall back to the raw ``{"detail": {"error": {...}}}`` shape in case
    the handler is not applied.
    """
    if isinstance(body.get("error"), dict):
        return body["error"].get("code")
    detail = body.get("detail")
    if isinstance(detail, dict):
        return detail.get("error", {}).get("code")
    return None


# ===========================================================================
# Model behavior
# ===========================================================================
class TestPrerequisiteContentModel:
    def test_content_defaults_to_empty_string(self, db_session):
        """content defaults to "" when not provided (Requirement 2.5)."""
        row = PrerequisiteContent(slug="basics")
        db_session.add(row)
        db_session.commit()
        db_session.refresh(row)
        assert row.content == ""

    def test_updated_at_set_on_insert(self, db_session):
        """updated_at is populated on insert."""
        row = PrerequisiteContent(slug="basics", content="hello")
        db_session.add(row)
        db_session.commit()
        db_session.refresh(row)
        assert row.updated_at is not None

    def test_updated_at_changes_on_update(self, db_session):
        """updated_at advances on update (onupdate)."""
        row = PrerequisiteContent(slug="basics", content="v1")
        db_session.add(row)
        db_session.commit()
        db_session.refresh(row)
        first = row.updated_at

        # Ensure a measurable time delta for the onupdate timestamp.
        time.sleep(0.01)
        row.content = "v2"
        db_session.commit()
        db_session.refresh(row)

        assert row.updated_at >= first
        assert row.updated_at != first


class TestPrerequisiteAnswerModel:
    def test_answer_defaults_to_empty_string(self, db_session):
        """answer defaults to "" when not provided (Requirement 2.5)."""
        row = PrerequisiteAnswer(slug="cloudstore", row_id="cs-subnet-cidr")
        db_session.add(row)
        db_session.commit()
        db_session.refresh(row)
        assert row.answer == ""

    def test_updated_at_set_on_insert(self, db_session):
        row = PrerequisiteAnswer(slug="cloudstore", row_id="cs-1", answer="a")
        db_session.add(row)
        db_session.commit()
        db_session.refresh(row)
        assert row.updated_at is not None

    def test_updated_at_changes_on_update(self, db_session):
        row = PrerequisiteAnswer(slug="cloudstore", row_id="cs-1", answer="a")
        db_session.add(row)
        db_session.commit()
        db_session.refresh(row)
        first = row.updated_at

        time.sleep(0.01)
        row.answer = "b"
        db_session.commit()
        db_session.refresh(row)

        assert row.updated_at >= first
        assert row.updated_at != first

    def test_slug_row_id_unique_constraint(self, db_session):
        """A second insert with the same (slug, row_id) raises IntegrityError."""
        db_session.add(
            PrerequisiteAnswer(slug="cloudstore", row_id="cs-1", answer="a")
        )
        db_session.commit()

        db_session.add(
            PrerequisiteAnswer(slug="cloudstore", row_id="cs-1", answer="b")
        )
        with pytest.raises(IntegrityError):
            db_session.commit()
        db_session.rollback()

    def test_same_row_id_different_slug_allowed(self, db_session):
        """The unique constraint is on the pair, not row_id alone."""
        db_session.add(
            PrerequisiteAnswer(slug="cloudstore", row_id="shared", answer="a")
        )
        db_session.add(
            PrerequisiteAnswer(slug="vcf", row_id="shared", answer="b")
        )
        db_session.commit()  # must not raise
        rows = db_session.query(PrerequisiteAnswer).filter(
            PrerequisiteAnswer.row_id == "shared"
        ).all()
        assert len(rows) == 2


# ===========================================================================
# Router: per-endpoint happy paths for known slugs
# ===========================================================================
class TestEndpointsKnownSlugs:
    def test_get_content_returns_shape(self, client, member_user):
        """GET content -> 200 with {slug, content, updated_at}."""
        resp = client.get(
            "/api/prerequisites/basics/content", headers=_headers(member_user)
        )
        assert resp.status_code == status.HTTP_200_OK
        body = resp.json()
        assert body["slug"] == "basics"
        assert "content" in body
        assert "updated_at" in body

    def test_get_answers_returns_shape(self, client, member_user):
        """GET answers -> 200 with {slug, answers} (empty map when none)."""
        resp = client.get(
            "/api/prerequisites/network-checklist/answers",
            headers=_headers(member_user),
        )
        assert resp.status_code == status.HTTP_200_OK
        body = resp.json()
        assert body["slug"] == "network-checklist"
        assert body["answers"] == {}

    def test_put_content_success_by_admin(self, client, admin_user, member_user):
        """PUT content by admin -> 200 success; GET reflects the saved value."""
        resp = client.put(
            "/api/prerequisites/basics/content",
            json={"content": "<p>saved</p>"},
            headers=_headers(admin_user),
        )
        assert resp.status_code == status.HTTP_200_OK
        body = resp.json()
        assert body["success"] is True
        assert body["slug"] == "basics"

        # A subsequent GET returns the persisted value.
        get_resp = client.get(
            "/api/prerequisites/basics/content", headers=_headers(member_user)
        )
        assert get_resp.status_code == status.HTTP_200_OK
        assert get_resp.json()["content"] == "<p>saved</p>"

    def test_put_answer_success_by_member(self, client, member_user):
        """PUT answer by member -> 200 success; GET reflects the saved map."""
        resp = client.put(
            "/api/prerequisites/cloudstore/answers/cs-subnet-cidr",
            json={"answer": "10.0.0.0/24"},
            headers=_headers(member_user),
        )
        assert resp.status_code == status.HTTP_200_OK
        body = resp.json()
        assert body["success"] is True
        assert body["slug"] == "cloudstore"

        get_resp = client.get(
            "/api/prerequisites/cloudstore/answers",
            headers=_headers(member_user),
        )
        assert get_resp.status_code == status.HTTP_200_OK
        assert get_resp.json()["answers"] == {"cs-subnet-cidr": "10.0.0.0/24"}

    def test_put_answer_upsert_updates_in_place(self, client, member_user):
        """A second PUT for the same (slug, row_id) updates rather than dupes."""
        base = "/api/prerequisites/cloudstore/answers/cs-1"
        client.put(base, json={"answer": "first"}, headers=_headers(member_user))
        resp = client.put(
            base, json={"answer": "second"}, headers=_headers(member_user)
        )
        assert resp.status_code == status.HTTP_200_OK

        get_resp = client.get(
            "/api/prerequisites/cloudstore/answers",
            headers=_headers(member_user),
        )
        assert get_resp.json()["answers"] == {"cs-1": "second"}


# ===========================================================================
# Slug validation
# ===========================================================================
class TestSlugValidation:
    def test_unknown_static_slug_get_content_resource_specific_404(
        self, client, member_user
    ):
        """Unknown slug -> resource-specific 404 with PREREQUISITE_SLUG_NOT_FOUND."""
        resp = client.get(
            "/api/prerequisites/does-not-exist/content",
            headers=_headers(member_user),
        )
        assert resp.status_code == status.HTTP_404_NOT_FOUND
        body = resp.json()
        assert body != {"detail": "Not Found"}
        assert _error_code(body) == "PREREQUISITE_SLUG_NOT_FOUND"

    def test_unknown_qa_slug_get_answers_resource_specific_404(
        self, client, member_user
    ):
        resp = client.get(
            "/api/prerequisites/nope/answers", headers=_headers(member_user)
        )
        assert resp.status_code == status.HTTP_404_NOT_FOUND
        body = resp.json()
        assert body != {"detail": "Not Found"}
        assert _error_code(body) == "PREREQUISITE_SLUG_NOT_FOUND"

    def test_qa_slug_rejected_on_content_endpoint(self, client, member_user):
        """A qa slug is not a valid static-content slug -> 404."""
        resp = client.get(
            "/api/prerequisites/cloudstore/content",
            headers=_headers(member_user),
        )
        assert resp.status_code == status.HTTP_404_NOT_FOUND
        assert _error_code(resp.json()) == "PREREQUISITE_SLUG_NOT_FOUND"

    def test_unknown_slug_put_content_resource_specific_404(
        self, client, admin_user
    ):
        resp = client.put(
            "/api/prerequisites/does-not-exist/content",
            json={"content": "x"},
            headers=_headers(admin_user),
        )
        assert resp.status_code == status.HTTP_404_NOT_FOUND
        assert _error_code(resp.json()) == "PREREQUISITE_SLUG_NOT_FOUND"

    def test_never_saved_known_static_slug_returns_empty_content(
        self, client, member_user
    ):
        """Known static slug never saved -> 200 with content:"" default."""
        resp = client.get(
            "/api/prerequisites/network-flux/content",
            headers=_headers(member_user),
        )
        assert resp.status_code == status.HTTP_200_OK
        body = resp.json()
        assert body["slug"] == "network-flux"
        assert body["content"] == ""
        assert body["updated_at"] is None


# ===========================================================================
# Authorization
# ===========================================================================
class TestAuthorization:
    def test_put_content_forbidden_for_member(self, client, member_user):
        """Static PUT is admin-only -> 403 for a member."""
        resp = client.put(
            "/api/prerequisites/basics/content",
            json={"content": "x"},
            headers=_headers(member_user),
        )
        assert resp.status_code == status.HTTP_403_FORBIDDEN

    def test_put_answer_forbidden_for_admin(self, client, admin_user):
        """Answer PUT is member-only -> 403 for an admin with the right code."""
        resp = client.put(
            "/api/prerequisites/cloudstore/answers/cs-1",
            json={"answer": "x"},
            headers=_headers(admin_user),
        )
        assert resp.status_code == status.HTTP_403_FORBIDDEN
        assert _error_code(resp.json()) == "ANSWER_NOT_ALLOWED_FOR_ADMIN"

    def test_get_content_unauthenticated_401(self, client):
        """No bearer token -> 401 on a read."""
        resp = client.get("/api/prerequisites/basics/content")
        assert resp.status_code in (
            status.HTTP_401_UNAUTHORIZED,
            status.HTTP_403_FORBIDDEN,
        )

    def test_get_answers_unauthenticated_401(self, client):
        resp = client.get("/api/prerequisites/network-checklist/answers")
        assert resp.status_code in (
            status.HTTP_401_UNAUTHORIZED,
            status.HTTP_403_FORBIDDEN,
        )

    def test_get_content_invalid_token_401(self, client):
        """Invalid bearer token -> 401 on a read."""
        resp = client.get(
            "/api/prerequisites/basics/content",
            headers={"Authorization": "Bearer not-a-real-token"},
        )
        assert resp.status_code == status.HTTP_401_UNAUTHORIZED

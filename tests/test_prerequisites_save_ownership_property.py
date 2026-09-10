"""Property-based test for per-user prerequisites save ownership (task 3.2).

Spec: .kiro/specs/per-user-prerequisites-persistence

Property 1: Saved answers are owned by the submitting member.

For any Member and any Q&A slug, Row_Id, and answer text they submit via PUT,
after the upsert the persisted Answer_Record for (member, slug, row_id) exists
and carries user_id equal to the submitting member's id and the submitted
answer text.

Feature: per-user-prerequisites-persistence, Property 1: Saved answers are owned by the submitting member

Validates: Requirements 1.1, 1.3, 3.2, 5.2

State isolation note: the conftest ``client`` fixture is function-scoped and
recreates the DB per test, but ``@given`` runs many examples inside a SINGLE
test function (one DB). Each example must therefore be self-isolating. We
generate a unique member per example (unique email) and clean up the answer
row(s) the example wrote at the end, so state from one example never corrupts
another's assertions. Function-scoped-fixture health checks are suppressed as
recommended by Hypothesis for this pattern.
"""
import uuid

import pytest
from fastapi import status
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from app.models import User, UserRole
from app.models.prerequisite import PrerequisiteAnswer
from app.auth.token import create_access_token


# Q&A slugs, kept in sync with app/prerequisites/router.py.
QA_SLUGS = ("network-checklist", "core-control-plane", "cloudstore", "vcf")


def _headers(user):
    token = create_access_token({"sub": str(user.id)})
    return {"Authorization": f"Bearer {token}"}


def _session():
    """Open a session on the same engine the conftest test harness uses."""
    from tests.conftest import TestingSessionLocal
    return TestingSessionLocal()


def _make_member():
    """Create a fresh member (unique email) and return their id.

    Uses a standalone session on the shared test engine so the member is
    persisted independently of any per-example cleanup.
    """
    db = _session()
    try:
        user = User(
            email=f"member-{uuid.uuid4().hex}@prereq.test",
            password_hash="hashed_password",
            first_name="Member",
            last_name="User",
            role=UserRole.MEMBER,
            is_email_verified=True,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        return user
    finally:
        db.close()


# rowIds mirror the frontend `rowId` shape (slug-like identifiers). Kept ASCII
# and free of `/` so they stay a single path segment.
_row_id = st.text(
    alphabet="abcdefghijklmnopqrstuvwxyz0123456789-_",
    min_size=1,
    max_size=24,
).filter(lambda s: s.strip("-_") != "")

# Answer bodies: arbitrary text (the API stores rich-text HTML but any string
# round-trips through JSON).
_answer = st.text(max_size=200)


@settings(
    max_examples=100,
    deadline=None,
    suppress_health_check=[HealthCheck.function_scoped_fixture],
)
@given(
    slug=st.sampled_from(QA_SLUGS),
    row_id=_row_id,
    answer=_answer,
)
def test_saved_answer_is_owned_by_submitting_member(client, slug, row_id, answer):
    """PUT by a member persists an Answer_Record owned by that member.

    For any member + qa slug + rowId + answer, after the PUT upsert the
    persisted row for (member.id, slug, row_id) exists, carries
    user_id == member.id, and holds the submitted answer text.

    Validates: Requirements 1.1, 1.3, 3.2, 5.2
    """
    member = _make_member()

    put_path = f"/api/prerequisites/{slug}/answers/{row_id}"
    put_resp = client.put(
        put_path, json={"answer": answer}, headers=_headers(member)
    )
    assert put_resp.status_code == status.HTTP_200_OK, (
        f"PUT {put_path} -> {put_resp.status_code}: {put_resp.text[:200]}"
    )
    assert put_resp.json() == {"success": True, "slug": slug}

    # Verify ownership directly against the persistence layer: the record for
    # (member, slug, row_id) exists, is owned by the submitting member, and
    # carries the submitted answer text.
    db = _session()
    try:
        rows = (
            db.query(PrerequisiteAnswer)
            .filter(
                PrerequisiteAnswer.user_id == member.id,
                PrerequisiteAnswer.slug == slug,
                PrerequisiteAnswer.row_id == row_id,
            )
            .all()
        )
        assert len(rows) == 1, (
            f"expected exactly one owned Answer_Record for "
            f"({member.id}, {slug!r}, {row_id!r}), got {len(rows)}"
        )
        row = rows[0]
        assert row.user_id == member.id, (
            f"ownership violated: row.user_id={row.user_id!r} "
            f"!= submitting member {member.id!r}"
        )
        assert row.answer == answer, (
            f"answer text not persisted: wrote {answer!r}, stored {row.answer!r}"
        )
    finally:
        db.close()

    # --- Per-example isolation: remove the row this example wrote so the single
    # shared DB does not accumulate state across examples. ---
    db = _session()
    try:
        db.query(PrerequisiteAnswer).filter(
            PrerequisiteAnswer.user_id == member.id,
        ).delete(synchronize_session=False)
        db.commit()
    finally:
        db.close()

"""Property-based test for cross-member isolation on save (task 3.4).

Spec: .kiro/specs/per-user-prerequisites-persistence

Property 3: One member's save never alters another member's answer.

For any two distinct Members sharing the same Q&A slug and Row_Id, when one
Member creates or updates their answer via PUT, the other Member's
Answer_Record for that same slug and Row_Id is left unchanged.

Feature: per-user-prerequisites-persistence, Property 3: One member's save never alters another member's answer

Validates: Requirements 1.4

State isolation note: the conftest ``client`` fixture is function-scoped and
recreates the DB per test, but ``@given`` runs many examples inside a SINGLE
test function (one DB). Each example must therefore be self-isolating. We
generate two fresh members per example (unique emails) and clean up the answer
rows the example wrote at the end, so state from one example never corrupts
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
    """Create a fresh member (unique email) and return the User instance.

    Uses a standalone session on the shared test engine so the member is
    persisted independently of any per-example cleanup.
    """
    db = _session()
    try:
        user = User(
            email=f"member-{uuid.uuid4().hex}@prereq.isolation.test",
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


def _fetch_answer(db_factory_user_id, slug, row_id):
    """Return the single stored answer for (user_id, slug, row_id) or None."""
    db = _session()
    try:
        row = (
            db.query(PrerequisiteAnswer)
            .filter(
                PrerequisiteAnswer.user_id == db_factory_user_id,
                PrerequisiteAnswer.slug == slug,
                PrerequisiteAnswer.row_id == row_id,
            )
            .one_or_none()
        )
        return None if row is None else row.answer
    finally:
        db.close()


def _cleanup(*user_ids):
    db = _session()
    try:
        db.query(PrerequisiteAnswer).filter(
            PrerequisiteAnswer.user_id.in_(list(user_ids)),
        ).delete(synchronize_session=False)
        db.commit()
    finally:
        db.close()


# rowIds mirror the frontend `rowId` shape (slug-like identifiers). Kept ASCII
# and free of `/` so they stay a single path segment. Small to bound runtime.
_row_id = st.text(
    alphabet="abcdefghijklmnopqrstuvwxyz0123456789-_",
    min_size=1,
    max_size=24,
).filter(lambda s: s.strip("-_") != "")

# Answer bodies: arbitrary text (max_size kept small to bound runtime).
_answer = st.text(max_size=200)


@settings(
    max_examples=100,
    deadline=None,
    suppress_health_check=[HealthCheck.function_scoped_fixture],
)
@given(
    slug=st.sampled_from(QA_SLUGS),
    row_id=_row_id,
    other_answer=_answer,
    saving_answer=_answer,
)
def test_save_does_not_alter_other_members_answer(
    client, slug, row_id, other_answer, saving_answer
):
    """One member's save never alters another member's answer.

    Two distinct members share the same slug + rowId. The "other" member first
    persists their answer. Then the "saving" member creates/updates their own
    answer for the same slug + rowId. Afterwards the other member's stored
    Answer_Record for that slug + rowId is unchanged.

    Validates: Requirements 1.4
    """
    other_member = _make_member()
    saving_member = _make_member()
    assert other_member.id != saving_member.id

    put_path = f"/api/prerequisites/{slug}/answers/{row_id}"

    # The "other" member establishes their own answer for the shared triple.
    other_put = client.put(
        put_path, json={"answer": other_answer}, headers=_headers(other_member)
    )
    assert other_put.status_code == status.HTTP_200_OK, (
        f"PUT {put_path} (other) -> {other_put.status_code}: "
        f"{other_put.text[:200]}"
    )

    # Snapshot the other member's persisted answer before the saving member acts.
    other_before = _fetch_answer(other_member.id, slug, row_id)
    assert other_before == other_answer

    # The "saving" member creates/updates their OWN answer for the same triple.
    saving_put = client.put(
        put_path, json={"answer": saving_answer}, headers=_headers(saving_member)
    )
    assert saving_put.status_code == status.HTTP_200_OK, (
        f"PUT {put_path} (saving) -> {saving_put.status_code}: "
        f"{saving_put.text[:200]}"
    )
    assert saving_put.json() == {"success": True, "slug": slug}

    # The other member's Answer_Record for the same slug + rowId is untouched.
    other_after = _fetch_answer(other_member.id, slug, row_id)
    assert other_after == other_before, (
        f"COUNTEREXAMPLE: saving member {saving_member.id} altered other "
        f"member {other_member.id}'s answer for ({slug!r}, {row_id!r}): "
        f"before={other_before!r} after={other_after!r}"
    )

    # The saving member's own record reflects what they submitted.
    saving_stored = _fetch_answer(saving_member.id, slug, row_id)
    assert saving_stored == saving_answer, (
        f"saving member's own answer not persisted: wrote {saving_answer!r}, "
        f"stored {saving_stored!r}"
    )

    # --- Per-example isolation: remove rows this example wrote. ---
    _cleanup(other_member.id, saving_member.id)

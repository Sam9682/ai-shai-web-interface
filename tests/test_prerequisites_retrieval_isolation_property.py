"""Property-based test for per-user prerequisites retrieval isolation.

Feature spec: .kiro/specs/per-user-prerequisites-persistence (task 2.2)

Property 4: Retrieval returns exactly the requesting member's answers

For any database state containing Answer_Records from arbitrary Members, and
any Member requesting a Q&A slug, the ``GET /{slug}/answers`` response contains
exactly the Answer_Records whose ``user_id`` matches the requesting Member for
that slug -- no more (other members' records excluded, other slugs excluded)
and no fewer (empty when the Member has none).

Validates: Requirements 2.1, 2.2, 2.3, 5.1

State isolation note: the conftest ``client`` fixture is function-scoped and
recreates the DB per test, but ``@given`` runs many examples inside a SINGLE
test function (one DB). Each example is therefore made self-isolating: it seeds
a generated set of answer rows directly into the DB, drives the assertions,
then deletes every row it created so state never leaks between examples.
Function-scoped-fixture health checks are suppressed as recommended by
Hypothesis for this pattern.
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


# ---------------------------------------------------------------------------
# Strategies
# ---------------------------------------------------------------------------
# row_ids mirror the frontend `rowId` shape: short slug-like identifiers.
_row_id = st.text(
    alphabet="abcdefghijklmnopqrstuvwxyz0123456789-_",
    min_size=1,
    max_size=24,
).filter(lambda s: s.strip("-_") != "")

_answer = st.text(max_size=200)

# A single seeded record: (member_index, slug, row_id, answer). member_index
# selects which of the pre-created members owns the row; it is mapped to a real
# user_id inside the test. Keeping it an index keeps the strategy independent of
# DB-assigned ids.
_record = st.tuples(
    st.integers(min_value=0, max_value=2),   # one of 3 members (A, B, C)
    st.sampled_from(QA_SLUGS),
    _row_id,
    _answer,
)


@pytest.fixture
def members(db_session):
    """Create three distinct member users (A, B, C)."""
    created = []
    for i in range(3):
        user = User(
            email=f"member-{i}@retrieval-isolation.test",
            password_hash="hashed_password",
            first_name="Member",
            last_name=f"{i}",
            role=UserRole.MEMBER,
            is_email_verified=True,
        )
        db_session.add(user)
        created.append(user)
    db_session.commit()
    for user in created:
        db_session.refresh(user)
    return created


# ===========================================================================
# Property 4: retrieval returns exactly the requesting member's answers.
# ===========================================================================
@settings(
    max_examples=100,
    deadline=None,
    suppress_health_check=[HealthCheck.function_scoped_fixture],
)
@given(
    records=st.lists(_record, min_size=0, max_size=15),
    requester_index=st.integers(min_value=0, max_value=2),
    requested_slug=st.sampled_from(QA_SLUGS),
)
def test_retrieval_returns_exactly_requesting_members_answers(
    client, members, records, requester_index, requested_slug
):
    """Feature: per-user-prerequisites-persistence, Property 4: Retrieval
    returns exactly the requesting member's answers.

    Seed an arbitrary set of answer rows owned by arbitrary members across the
    Q&A slugs, then GET one slug as one member. The returned map must equal the
    last-write-wins reduction of exactly that member's rows for that slug --
    excluding other members' rows and other slugs, and empty when the member
    has none.

    Validates: Requirements 2.1, 2.2, 2.3, 5.1
    """
    member_ids = [m.id for m in members]

    # Deduplicate to the unique (user_id, slug, row_id) rows that the unique
    # constraint permits, applying last-write-wins per triple to mirror how the
    # upsert path would collapse repeated submissions.
    by_triple: dict[tuple[uuid.UUID, str, str], str] = {}
    for member_index, slug, row_id, answer in records:
        by_triple[(member_ids[member_index], slug, row_id)] = answer

    # Expected map for the requester + requested slug: exactly their rows.
    requester_id = member_ids[requester_index]
    expected = {
        row_id: answer
        for (uid, slug, row_id), answer in by_triple.items()
        if uid == requester_id and slug == requested_slug
    }

    # --- Seed the generated DB state directly. ---
    db = _session()
    seeded_ids = []
    try:
        for (uid, slug, row_id), answer in by_triple.items():
            row = PrerequisiteAnswer(
                user_id=uid,
                slug=slug,
                row_id=row_id,
                answer=answer,
                updated_by=uid,
            )
            db.add(row)
            db.flush()
            seeded_ids.append(row.id)
        db.commit()
    except Exception:
        db.rollback()
        db.close()
        raise

    try:
        resp = client.get(
            f"/api/prerequisites/{requested_slug}/answers",
            headers=_headers(members[requester_index]),
        )
        assert resp.status_code == status.HTTP_200_OK
        body = resp.json()
        assert body["slug"] == requested_slug

        got = body["answers"]
        assert got == expected, (
            "COUNTEREXAMPLE: retrieval isolation violated for "
            f"member={requester_id} slug={requested_slug!r}: "
            f"expected {expected!r}, got {got!r}"
        )
    finally:
        # --- Per-example isolation: delete every row this example seeded. ---
        cleanup = _session()
        try:
            cleanup.query(PrerequisiteAnswer).filter(
                PrerequisiteAnswer.id.in_(seeded_ids)
            ).delete(synchronize_session=False)
            cleanup.commit()
        finally:
            cleanup.close()
        db.close()

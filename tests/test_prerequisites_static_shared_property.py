"""Property-based test for shared static prerequisite content (task 6.1).

Spec: .kiro/specs/per-user-prerequisites-persistence

Property 5: Static content is identical across users.

For any Static_Slug (basics, network-flux) and any two distinct authenticated
users, requesting ``GET /{slug}/content`` returns the same shared content value
independent of user_id. Static content is keyed by slug alone
(``PrerequisiteContent``) with no per-user answer scope, so both users observe
one shared value.

Feature: per-user-prerequisites-persistence, Property 5: Static content is identical across users

Validates: Requirements 4.1, 4.2

State isolation note: the conftest ``client`` fixture is function-scoped and
recreates the DB per test, but ``@given`` runs many examples inside a SINGLE
test function (one DB). Each example is therefore self-isolating: it upserts the
static content row for the generated slug, drives the assertions with two
distinct freshly-created members (unique emails), then deletes the content row
it wrote so state never leaks between examples. Function-scoped-fixture health
checks are suppressed as recommended by Hypothesis for this pattern.
"""
import uuid

from fastapi import status
from hypothesis import HealthCheck, given, settings
from hypothesis import strategies as st

from app.models import User, UserRole
from app.models.prerequisite import PrerequisiteContent
from app.auth.token import create_access_token


# Static slugs, kept in sync with app/prerequisites/router.py (STATIC_SLUGS).
STATIC_SLUGS = ("basics", "network-flux")


def _headers(user):
    token = create_access_token({"sub": str(user.id)})
    return {"Authorization": f"Bearer {token}"}


def _session():
    """Open a session on the same engine the conftest test harness uses."""
    from tests.conftest import TestingSessionLocal
    return TestingSessionLocal()


def _make_member():
    """Create a fresh member (unique email) and return the persisted user.

    Uses a standalone session on the shared test engine so the member is
    persisted independently of any per-example cleanup.
    """
    db = _session()
    try:
        user = User(
            email=f"member-{uuid.uuid4().hex}@static-shared.test",
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


# Static content bodies: arbitrary text (the API stores rich-text HTML but any
# string round-trips through JSON). Bounded to keep runtime small.
_content = st.text(max_size=200)


@settings(
    max_examples=100,
    deadline=None,
    suppress_health_check=[HealthCheck.function_scoped_fixture],
)
@given(
    slug=st.sampled_from(STATIC_SLUGS),
    content=_content,
)
def test_static_content_is_identical_across_users(client, slug, content):
    """Two distinct members observe the same shared static content.

    For any static slug and any generated shared content value, after seeding
    the single ``PrerequisiteContent`` row, two distinct authenticated members
    each GET ``/{slug}/content`` and both receive the identical shared content
    independent of their user_id.

    Validates: Requirements 4.1, 4.2
    """
    user_a = _make_member()
    user_b = _make_member()
    assert user_a.id != user_b.id, "test requires two distinct users"

    # --- Seed the single shared static content row for this slug. ---
    db = _session()
    try:
        row = PrerequisiteContent(
            slug=slug,
            content=content,
            updated_by=user_a.id,
        )
        db.add(row)
        db.commit()
    except Exception:
        db.rollback()
        db.close()
        raise

    try:
        path = f"/api/prerequisites/{slug}/content"

        resp_a = client.get(path, headers=_headers(user_a))
        resp_b = client.get(path, headers=_headers(user_b))

        assert resp_a.status_code == status.HTTP_200_OK, (
            f"GET {path} (user A) -> {resp_a.status_code}: {resp_a.text[:200]}"
        )
        assert resp_b.status_code == status.HTTP_200_OK, (
            f"GET {path} (user B) -> {resp_b.status_code}: {resp_b.text[:200]}"
        )

        body_a = resp_a.json()
        body_b = resp_b.json()

        # Both responses report the same slug and the same shared content,
        # matching the seeded value independent of which user asked.
        assert body_a["slug"] == slug
        assert body_b["slug"] == slug
        assert body_a["content"] == content, (
            "COUNTEREXAMPLE: user A saw content diverging from the shared value "
            f"for slug={slug!r}: expected {content!r}, got {body_a['content']!r}"
        )
        assert body_a["content"] == body_b["content"], (
            "COUNTEREXAMPLE: static content differs across users for "
            f"slug={slug!r}: user A got {body_a['content']!r}, "
            f"user B got {body_b['content']!r}"
        )
    finally:
        # --- Per-example isolation: remove the content row this example wrote. ---
        cleanup = _session()
        try:
            cleanup.query(PrerequisiteContent).filter(
                PrerequisiteContent.slug == slug
            ).delete(synchronize_session=False)
            cleanup.commit()
        finally:
            cleanup.close()
        db.close()

"""Integration tests for the prerequisites route family: full round-trip
through the FastAPI ``TestClient`` with real JWT auth.

Bugfix spec: .kiro/specs/basics-prerequisites-404-fix (task 5)

These tests exercise end-to-end flows against the fixed app (router mounted,
persistence models created via the ``Base.metadata.create_all`` fixture in
``tests/conftest.py``). They use real ``Authorization: Bearer <jwt>`` headers
(no dependency overrides for auth) so the auth wiring is validated too.

Covered flows:
- Static flow (Requirements 2.2, 2.5): an admin saves ``basics`` content, a
  member loads it and receives the persisted value with a 200 (never a 404 or
  error that would trip the frontend load-error banner). The content
  round-trips exactly.
- Answer flow (Requirements 2.5, 3.x): a member writes several ``cloudstore``
  answers, reloads them, and a SECOND, distinct member (distinct JWT) sees only
  their OWN answers (answers are scoped per-user by ``(user_id, slug, row_id)``,
  not shared per-slug).

Validates: Requirements 2.2, 2.5, 3.1, 3.2, 3.3, 3.4, 3.5
"""
import pytest
from fastapi import status

from app.models import User, UserRole
from app.auth.token import create_access_token


# ---------------------------------------------------------------------------
# Fixtures (mirror tests/test_prerequisites_unit.py: admin_user / member_user +
# JWT _headers). We add a SECOND member to prove cross-session sharing.
# ---------------------------------------------------------------------------
@pytest.fixture
def admin_user(db_session):
    """Create an administrator user (allowed to PUT static content)."""
    user = User(
        email="admin@prereq.integration.test",
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
    """Create the first member user (writes answers, reads content)."""
    user = User(
        email="member-a@prereq.integration.test",
        password_hash="hashed_password",
        first_name="Member",
        last_name="Alpha",
        role=UserRole.MEMBER,
        is_email_verified=True,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture
def member_user_b(db_session):
    """Create a SECOND, distinct member user (distinct session / JWT).

    Used to assert answers are scoped per user rather than shared server-side
    per slug.
    """
    user = User(
        email="member-b@prereq.integration.test",
        password_hash="hashed_password",
        first_name="Member",
        last_name="Bravo",
        role=UserRole.MEMBER,
        is_email_verified=True,
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


def _headers(user):
    """Build a real bearer-token header for the given user."""
    token = create_access_token({"sub": str(user.id)})
    return {"Authorization": f"Bearer {token}"}


# ===========================================================================
# Static flow: admin saves -> member loads persisted value (no load error)
# ===========================================================================
class TestStaticContentRoundTrip:
    def test_admin_save_then_member_load_round_trips_exactly(
        self, client, admin_user, member_user
    ):
        """Admin PUTs basics content; a member GETs the exact persisted value.

        The GET returns 200 with the exact content (never a 404 / error that
        would trigger the frontend load-error banner). Requirements 2.2, 2.5.
        """
        content = "<h1>OPCP Basics</h1><p>Some rich <b>content</b> &amp; notes.</p>"

        put_resp = client.put(
            "/api/prerequisites/basics/content",
            json={"content": content},
            headers=_headers(admin_user),
        )
        assert put_resp.status_code == status.HTTP_200_OK
        assert put_resp.json()["success"] is True

        # A different session (a member) loads the content.
        get_resp = client.get(
            "/api/prerequisites/basics/content",
            headers=_headers(member_user),
        )

        # 200, not a 404 or error -> the load-error banner never triggers.
        assert get_resp.status_code == status.HTTP_200_OK
        body = get_resp.json()
        assert body["slug"] == "basics"
        # The persisted content round-trips exactly (byte-for-byte).
        assert body["content"] == content
        assert body["updated_at"] is not None

    def test_never_saved_slug_loads_empty_default_not_error(
        self, client, member_user
    ):
        """A never-saved known static slug returns a 200 empty default.

        This is the key anti-banner behavior: a first-visit page renders
        cleanly (200, content:"") instead of surfacing an error. Req 2.2.
        """
        resp = client.get(
            "/api/prerequisites/network-flux/content",
            headers=_headers(member_user),
        )
        assert resp.status_code == status.HTTP_200_OK
        body = resp.json()
        assert body["slug"] == "network-flux"
        assert body["content"] == ""
        assert body["updated_at"] is None

    def test_admin_overwrite_is_reflected_on_reload(
        self, client, admin_user, member_user
    ):
        """A second admin save overwrites; the member reload shows the update."""
        first = "<p>version one</p>"
        second = "<p>version two - updated</p>"

        client.put(
            "/api/prerequisites/basics/content",
            json={"content": first},
            headers=_headers(admin_user),
        )
        client.put(
            "/api/prerequisites/basics/content",
            json={"content": second},
            headers=_headers(admin_user),
        )

        get_resp = client.get(
            "/api/prerequisites/basics/content",
            headers=_headers(member_user),
        )
        assert get_resp.status_code == status.HTTP_200_OK
        assert get_resp.json()["content"] == second


# ===========================================================================
# Answer flow: member writes many answers -> reload map; second member shares
# ===========================================================================
class TestAnswerRoundTripAndSharing:
    def test_member_saves_several_answers_and_reload_returns_same_map(
        self, client, member_user
    ):
        """Member PUTs several cloudstore answers; GET returns the same map.

        Requirement 2.5: PUT persists so a subsequent GET returns the value.
        """
        answers = {
            "cs-subnet-cidr": "10.0.0.0/24",
            "cs-region": "eu-west-1",
            "cs-bucket-name": "opcp-artifacts",
        }
        for row_id, answer in answers.items():
            resp = client.put(
                f"/api/prerequisites/cloudstore/answers/{row_id}",
                json={"answer": answer},
                headers=_headers(member_user),
            )
            assert resp.status_code == status.HTTP_200_OK
            assert resp.json()["success"] is True

        get_resp = client.get(
            "/api/prerequisites/cloudstore/answers",
            headers=_headers(member_user),
        )
        assert get_resp.status_code == status.HTTP_200_OK
        assert get_resp.json()["answers"] == answers

    def test_answers_are_isolated_across_distinct_member_sessions(
        self, client, member_user, member_user_b
    ):
        """Member A writes answers; a distinct member B (distinct JWT) sees
        only their OWN answers, never member A's.

        Per the per-user-prerequisites-persistence feature, answers are keyed by
        (user_id, slug, row_id). Each member's retrieval returns exactly their
        own records and excludes every other member's records.
        Requirements 2.1, 2.2, 2.3.
        """
        # Sanity: the two members are genuinely distinct sessions.
        assert member_user.id != member_user_b.id
        assert _headers(member_user) != _headers(member_user_b)

        a_answers = {
            "cs-subnet-cidr": "172.16.0.0/16",
            "cs-region": "us-east-2",
        }
        for row_id, answer in a_answers.items():
            resp = client.put(
                f"/api/prerequisites/cloudstore/answers/{row_id}",
                json={"answer": answer},
                headers=_headers(member_user),
            )
            assert resp.status_code == status.HTTP_200_OK

        # Member B has written nothing yet -> empty map (no leakage from A).
        b_get = client.get(
            "/api/prerequisites/cloudstore/answers",
            headers=_headers(member_user_b),
        )
        assert b_get.status_code == status.HTTP_200_OK
        assert b_get.json()["answers"] == {}

        # Member B writes their own answer under a row_id that A also used.
        b_put = client.put(
            "/api/prerequisites/cloudstore/answers/cs-region",
            json={"answer": "b-only-value"},
            headers=_headers(member_user_b),
        )
        assert b_put.status_code == status.HTTP_200_OK

        # Member B now sees only their own single answer.
        b_get2 = client.get(
            "/api/prerequisites/cloudstore/answers",
            headers=_headers(member_user_b),
        )
        assert b_get2.status_code == status.HTTP_200_OK
        assert b_get2.json()["answers"] == {"cs-region": "b-only-value"}

        # Member A's answers are unchanged by member B's write.
        a_get = client.get(
            "/api/prerequisites/cloudstore/answers",
            headers=_headers(member_user),
        )
        assert a_get.status_code == status.HTTP_200_OK
        assert a_get.json()["answers"] == a_answers

    def test_each_member_keeps_an_independent_answer_for_same_row(
        self, client, member_user, member_user_b
    ):
        """Two members writing the same (slug, row_id) keep independent rows.

        A write by member B never overwrites member A's answer; each member's
        retrieval reflects only their own last write. Requirement 1.4.
        """
        client.put(
            "/api/prerequisites/cloudstore/answers/cs-region",
            json={"answer": "written-by-a"},
            headers=_headers(member_user),
        )
        client.put(
            "/api/prerequisites/cloudstore/answers/cs-region",
            json={"answer": "written-by-b"},
            headers=_headers(member_user_b),
        )

        a_get = client.get(
            "/api/prerequisites/cloudstore/answers",
            headers=_headers(member_user),
        )
        assert a_get.status_code == status.HTTP_200_OK
        # Member A keeps their own value; B's write did not clobber it.
        assert a_get.json()["answers"] == {"cs-region": "written-by-a"}

        b_get = client.get(
            "/api/prerequisites/cloudstore/answers",
            headers=_headers(member_user_b),
        )
        assert b_get.status_code == status.HTTP_200_OK
        assert b_get.json()["answers"] == {"cs-region": "written-by-b"}

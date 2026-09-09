"""Bug condition exploration test for the prerequisites 404 bug.

Bugfix spec: .kiro/specs/basics-prerequisites-404-fix

This test ENCODES the EXPECTED behavior (Property 1 in design.md) for the
`/api/prerequisites/*` route family. On the CURRENT (unfixed) app no router is
mounted for this family, so every request returns an unmatched-route 404. This
test is therefore EXPECTED TO FAIL on the unfixed code — that failure confirms
the bug exists (Requirements 1.1, 1.2, 1.3, 1.4, 1.5).

The SAME assertions validate the fix later: once the router is mounted, known
slugs return 200 with the correct shape and unknown slugs return a
resource-specific 404 (Requirements 2.1-2.6).

isBugCondition(request): any request whose path matches
    /api/prerequisites/{slug}/content
    /api/prerequisites/{slug}/answers
    /api/prerequisites/{slug}/answers/{rowId}

Refutation guard: if any family request unexpectedly does NOT 404 on the unfixed
app, the "missing router" hypothesis is refuted — the guard test surfaces that.

Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5

Property 1: Bug Condition - Prerequisites API is served, not 404
"""
import pytest
from fastapi import status

from app.models import User, UserRole
from app.auth.token import create_access_token


# --- Known slug sets (kept in sync with the frontend PREREQ_NAV_ITEMS) ---
STATIC_SLUGS = ("basics", "network-flux")
QA_SLUGS = ("network-checklist", "core-control-plane", "cloudstore", "vcf")


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


# ---------------------------------------------------------------------------
# isBugCondition encoding: the concrete failing paths/verbs of the contract.
# Each entry is (method, path, json_body). These are the paths that MATCH the
# prerequisites contract and must be SERVED (never an unmatched-route 404).
# ---------------------------------------------------------------------------
def _is_bug_condition(method: str, path: str) -> bool:
    """Return True if the request targets the prerequisites API contract."""
    parts = [p for p in path.split("/") if p]
    if len(parts) < 4 or parts[0] != "api" or parts[1] != "prerequisites":
        return False
    resource = parts[3]
    if resource == "content" and len(parts) == 4:
        return True
    if resource == "answers" and len(parts) in (4, 5):
        return True
    return False


# ---------------------------------------------------------------------------
# Property 1: every request in the family is served, not an unmatched-route 404.
# On the UNFIXED app these assertions FAIL (the app returns 404 for the family).
# ---------------------------------------------------------------------------

def test_get_basics_content_is_served(client, member_user):
    """GET /api/prerequisites/basics/content -> 200 {slug, content, updated_at?}.

    Reported "Basics" symptom (Requirement 1.1/2.1). Unfixed: 404.
    """
    path = "/api/prerequisites/basics/content"
    assert _is_bug_condition("GET", path)
    resp = client.get(path, headers=_headers(member_user))

    assert resp.status_code != status.HTTP_404_NOT_FOUND, (
        f"COUNTEREXAMPLE: GET {path} -> 404 unmatched route "
        f"instead of 200 {{slug, content}} (bug confirmed)"
    )
    assert resp.status_code == status.HTTP_200_OK
    body = resp.json()
    assert body["slug"] == "basics"
    assert "content" in body


def test_get_network_flux_content_is_served(client, member_user):
    """GET /api/prerequisites/network-flux/content -> 200. Unfixed: 404 (Req 1.3/2.3)."""
    path = "/api/prerequisites/network-flux/content"
    assert _is_bug_condition("GET", path)
    resp = client.get(path, headers=_headers(member_user))

    assert resp.status_code != status.HTTP_404_NOT_FOUND, (
        f"COUNTEREXAMPLE: GET {path} -> 404 unmatched route "
        f"instead of 200 {{slug, content}} (bug confirmed)"
    )
    assert resp.status_code == status.HTTP_200_OK
    body = resp.json()
    assert body["slug"] == "network-flux"
    assert "content" in body


def test_get_answers_is_served(client, member_user):
    """GET /api/prerequisites/network-checklist/answers -> 200 {slug, answers}.

    Unfixed: 404 (Requirement 1.4/2.4).
    """
    path = "/api/prerequisites/network-checklist/answers"
    assert _is_bug_condition("GET", path)
    resp = client.get(path, headers=_headers(member_user))

    assert resp.status_code != status.HTTP_404_NOT_FOUND, (
        f"COUNTEREXAMPLE: GET {path} -> 404 unmatched route "
        f"instead of 200 {{slug, answers}} (bug confirmed)"
    )
    assert resp.status_code == status.HTTP_200_OK
    body = resp.json()
    assert body["slug"] == "network-checklist"
    assert isinstance(body["answers"], dict)


def test_put_static_content_is_served(client, admin_user):
    """PUT /api/prerequisites/basics/content persists. Unfixed: 404 (Req 1.5/2.5)."""
    path = "/api/prerequisites/basics/content"
    assert _is_bug_condition("PUT", path)
    resp = client.put(
        path,
        json={"content": "<p>hello</p>"},
        headers=_headers(admin_user),
    )

    assert resp.status_code != status.HTTP_404_NOT_FOUND, (
        f"COUNTEREXAMPLE: PUT {path} -> 404 unmatched route "
        f"instead of a success status (bug confirmed, change not persisted)"
    )
    assert resp.status_code in (status.HTTP_200_OK, status.HTTP_201_CREATED)


def test_put_answer_is_served(client, member_user):
    """PUT /api/prerequisites/cloudstore/answers/cs-subnet-cidr persists.

    Unfixed: 404 (Requirement 1.5/2.5).
    """
    path = "/api/prerequisites/cloudstore/answers/cs-subnet-cidr"
    assert _is_bug_condition("PUT", path)
    resp = client.put(
        path,
        json={"answer": "10.0.0.0/24"},
        headers=_headers(member_user),
    )

    assert resp.status_code != status.HTTP_404_NOT_FOUND, (
        f"COUNTEREXAMPLE: PUT {path} -> 404 unmatched route "
        f"instead of a success status (bug confirmed, answer not persisted)"
    )
    assert resp.status_code in (status.HTTP_200_OK, status.HTTP_201_CREATED)


def test_unknown_slug_content_is_resource_specific_404(client, member_user):
    """Edge: GET /api/prerequisites/does-not-exist/content.

    On the unfixed app this is an unmatched-route 404. After the fix it must be a
    resource-specific 404 with a structured ErrorResponse body (Requirement 2.6).
    The distinguishing assertion is the structured error body, which is absent on
    the unfixed app, so this FAILS on unfixed code too.
    """
    path = "/api/prerequisites/does-not-exist/content"
    assert _is_bug_condition("GET", path)
    resp = client.get(path, headers=_headers(member_user))

    assert resp.status_code == status.HTTP_404_NOT_FOUND
    body = resp.json()
    # A resource-specific 404 carries a structured ErrorResponse (has an error
    # code), unlike FastAPI's default unmatched-route body {"detail": "Not Found"}.
    assert body != {"detail": "Not Found"}, (
        f"COUNTEREXAMPLE: GET {path} -> unmatched-route 404 "
        f'{{"detail": "Not Found"}} instead of a resource-specific ErrorResponse '
        f"(bug confirmed)"
    )

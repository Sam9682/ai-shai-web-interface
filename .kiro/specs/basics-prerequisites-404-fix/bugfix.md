# Bugfix Requirements Document

## Introduction

Clicking the "Basics" item in the OPCP installation prerequisites menu triggers a failed request and a 404 error. The browser issues `GET /api/prerequisites/basics/content` and the server responds `404 Not Found`.

Investigation of the codebase shows the root cause is not a wrong slug or a wrong path on the frontend. The frontend was implemented against a documented backend contract (`GET/PUT /api/prerequisites/{slug}/content`, `GET /api/prerequisites/{slug}/answers`, `PUT /api/prerequisites/{slug}/answers/{rowId}`), but that backend was explicitly left out of scope for the frontend feature (see `.kiro/specs/opcp-prerequisites-tabs/tasks.md`, "Backend scope note"). The FastAPI app in `app/main.py` registers routers for auth, forum, payments, documents, events, admin, notifications, info, users, and oracle — there is no prerequisites router, model, or route registered. As a result, every request in the `/api/prerequisites/*` family returns 404, not just "Basics".

The frontend already handles the failure gracefully (`StaticContentPage` shows a non-blocking load-error banner), so the visible impact is that static prerequisites pages ("Basics", "Network Flux") never display server content and question/answer pages ("Network Checklist", "Core Control Plane", "CloudStore", "VCF") cannot load or persist answers.

Bug condition (informal): an HTTP request whose path matches the `/api/prerequisites/{slug}/content` or `/api/prerequisites/{slug}/answers[/ {rowId}]` contract triggers the bug, because no backend route is mounted to serve it.

```pascal
FUNCTION isBugCondition(request)
  INPUT: request of type HttpRequest
  OUTPUT: boolean

  // No backend route exists for the prerequisites API contract,
  // so any request in this family is unhandled and returns 404.
  RETURN request.path MATCHES "/api/prerequisites/{slug}/content"
      OR request.path MATCHES "/api/prerequisites/{slug}/answers"
      OR request.path MATCHES "/api/prerequisites/{slug}/answers/{rowId}"
END FUNCTION
```

```pascal
// Property: Fix Checking - Prerequisites content endpoint responds
FOR ALL request WHERE isBugCondition(request) DO
  result ← handle'(request)
  ASSERT result.status <> 404 (route_not_found)
  // GET content for a known slug returns 200 with { slug, content }
  // GET content for an unknown slug returns a well-defined 404 for that
  //   resource (not an unmatched-route 404), or an empty content default
END FOR
```

```pascal
// Property: Preservation Checking - all other endpoints unchanged
FOR ALL request WHERE NOT isBugCondition(request) DO
  ASSERT handle(request) = handle'(request)
END FOR
```

Where `handle` is the current app request handling and `handle'` is the handling after the fix.

## Bug Analysis

### Current Behavior (Defect)

When the OPCP prerequisites menu is used, the frontend calls the prerequisites API contract, but no backend route is mounted to serve it.

1.1 WHEN an authenticated user clicks the "Basics" prerequisites menu item THEN the frontend issues `GET /api/prerequisites/basics/content` and the server responds `404 Not Found`
1.2 WHEN the `StaticContentPage` for slug `basics` mounts and the load request returns 404 THEN the system displays the load-error banner ("Impossible de charger le contenu...") and never shows server-persisted content
1.3 WHEN a user opens any other static prerequisites page (e.g. slug `network-flux` via `GET /api/prerequisites/network-flux/content`) THEN the server responds `404 Not Found`
1.4 WHEN a user opens any question/answer prerequisites page (e.g. `GET /api/prerequisites/{slug}/answers` for `network-checklist`, `core-control-plane`, `cloudstore`, or `vcf`) THEN the server responds `404 Not Found`
1.5 WHEN an admin edits and saves static content (`PUT /api/prerequisites/{slug}/content`) or a member saves an answer (`PUT /api/prerequisites/{slug}/answers/{rowId}`) THEN the server responds `404 Not Found` and the change is not persisted

### Expected Behavior (Correct)

The backend must implement and mount the prerequisites API contract the frontend already targets, so requests are handled instead of returning an unmatched-route 404.

2.1 WHEN an authenticated user clicks the "Basics" prerequisites menu item THEN the system SHALL serve `GET /api/prerequisites/basics/content` with `200 OK` and a body of the form `{ slug, content, updated_at? }`
2.2 WHEN the `StaticContentPage` for slug `basics` mounts THEN the system SHALL return the persisted content (or a well-defined empty default for a slug that has no content yet) so the page renders without the load-error banner
2.3 WHEN a user opens any other static prerequisites page (e.g. slug `network-flux`) THEN the system SHALL serve `GET /api/prerequisites/{slug}/content` with `200 OK` and the same content shape
2.4 WHEN a user opens any question/answer prerequisites page THEN the system SHALL serve `GET /api/prerequisites/{slug}/answers` with `200 OK` and a body of the form `{ slug, answers }`
2.5 WHEN an admin saves static content (`PUT /api/prerequisites/{slug}/content`) or an authorized member saves an answer (`PUT /api/prerequisites/{slug}/answers/{rowId}`) THEN the system SHALL persist the value and respond with a success status, and a subsequent GET SHALL return the persisted value
2.6 WHEN a request targets the prerequisites API with an unsupported slug or resource THEN the system SHALL respond with a well-defined, resource-specific error rather than an unmatched-route 404 (e.g. a documented 404 or an empty default per the design decision made in design.md)

### Unchanged Behavior (Regression Prevention)

The fix adds a new backend route family and its persistence; all existing routes and behaviors must remain identical.

3.1 WHEN a request targets any existing backend route (auth, forum, payments, documents, events, admin, notifications, info, users, oracle) THEN the system SHALL CONTINUE TO handle it exactly as before
3.2 WHEN the `/health` or `/` root endpoints are called THEN the system SHALL CONTINUE TO return their current responses
3.3 WHEN the frontend `prerequisitesService` issues its requests THEN the system SHALL CONTINUE TO accept the existing paths, verbs, and request/response shapes (`/prerequisites/{slug}/content`, `/prerequisites/{slug}/answers`, `/prerequisites/{slug}/answers/{rowId}`) with no frontend contract change
3.4 WHEN an unauthenticated request hits a protected prerequisites endpoint THEN the system SHALL CONTINUE TO apply the existing authentication behavior consistent with other protected routers (not silently expose data)
3.5 WHEN CORS, rate limiting, and exception handling are exercised THEN the system SHALL CONTINUE TO apply the existing global middleware and handlers to the new routes as it does for existing ones

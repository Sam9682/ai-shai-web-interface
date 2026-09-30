# Bugfix Requirements Document

## Introduction

This spec covers two related items around the forum topic "View" button that is
shown to logged-out visitors on the home page (`frontend/src/pages/HomePage.tsx`).

**Bug 1 — Missing port in the "View" button URL.** For logged-out visitors, each
forum topic in the "Recent discussions" preview renders a "View" button whose
link is built from a hardcoded host string:

```
https://opcp-psmc.com/api/forum/topics/{topic.id}/publichtml
```

Because the host is hardcoded without the port, when the site is served on a
non-default port the resulting link drops that port. The browser then resolves
`https://opcp-psmc.com/...` on the default HTTPS port (443) instead of the port
the app is actually reachable on, and the target page returns "page not found".
The link should be built so that the port present in the current site origin is
preserved.

**Enhancement 2 — "Forum" configuration category with a "View" button toggle.**
The Configuration page (`frontend/src/pages/AdminConfigPage.tsx`) currently has
one settings category, "Oracle AI Providers" (rendered as "Oracle AI providers"),
backed by the `ai_provider_config` table and the `/admin/ai-providers` endpoints.
This enhancement adds a new "Forum" category immediately after it, containing a
single toggle labeled `Display the "View" button in the page`. The toggle
controls whether the "View" button appears on the home page for logged-out
visitors, and the setting is persisted using the same backend-config +
frontend-read pattern as the provider toggles.

The toggle uses non-inverted (intuitive) semantics: when activated (on) the
"View" button **is** displayed; when deactivated (off) the button is **not**
displayed. The default (never-configured) state is ON/enabled, so the button
stays visible and today's always-visible behavior is preserved. This is captured
in clauses 2.4 and 3.3 below.

## Bug Analysis

### Current Behavior (Defect)

What currently happens today.

1.1 WHEN a logged-out visitor views the home page forum preview THEN the system builds the "View" button link from the hardcoded string `https://opcp-psmc.com/api/forum/topics/{topic.id}/publichtml`, which omits the port and resolves to the default HTTPS port (443)

1.2 WHEN the app is served on a non-default port AND a logged-out visitor clicks the "View" button THEN the system navigates to a URL without the port and the target public HTML page returns "page not found"

1.3 WHEN an administrator opens the Configuration page THEN the system shows only the "Oracle AI Providers" category and provides no "Forum" category or "View" button visibility control

1.4 WHEN a logged-out visitor views the home page forum preview THEN the system always renders the "View" button, with no configuration option to hide it

### Expected Behavior (Correct)

What should happen instead.

2.1 WHEN a logged-out visitor views the home page forum preview THEN the system SHALL build the "View" button link so that the port of the current site origin is preserved, producing a URL that resolves to the correct `/api/forum/topics/{topic.id}/publichtml` page

2.2 WHEN the app is served on a non-default port AND a logged-out visitor clicks the "View" button THEN the system SHALL navigate to the public HTML page including the correct port so the page loads successfully instead of returning "page not found"

2.3 WHEN an administrator opens the Configuration page THEN the system SHALL display a new "Forum" category immediately after the "Oracle AI Providers" category, containing a single toggle labeled `Display the "View" button in the page`, styled to match the existing provider toggles, with its value persisted to and read from backend configuration

2.4 WHEN the "Forum" toggle is activated (on) THEN the system SHALL display the "View" button on the home page for logged-out visitors, AND WHEN the toggle is deactivated (off) THEN the system SHALL NOT display the "View" button (non-inverted semantics: on = shown, off = hidden)

### Unchanged Behavior (Regression Prevention)

Existing behavior that must be preserved.

3.1 WHEN a logged-out visitor clicks a topic title or the topic row THEN the system SHALL CONTINUE TO navigate to the in-app topic route `/forum/topics/{topic.id}`

3.2 WHEN an authenticated user views the home page forum preview THEN the system SHALL CONTINUE TO show the "See all" link and hide the read-only "View" button, unchanged by this fix

3.3 WHEN the "Forum" toggle has never been configured THEN the system SHALL CONTINUE TO display the "View" button by default (default = activated / ON, button shown), preserving today's always-visible behavior under the non-inverted semantics

3.4 WHEN an administrator edits and saves AI provider toggles THEN the system SHALL CONTINUE TO load, toggle, and persist provider enablement exactly as it does today, unaffected by the added "Forum" category

3.5 WHEN any request hits the backend `/api/forum/topics/{topic_id}/publichtml` endpoint THEN the system SHALL CONTINUE TO return the topic's public HTML page as it does today

## Bug Condition and Properties (Bug 1: missing port)

### Bug Condition

```pascal
FUNCTION isBugCondition(X)
  INPUT: X of type ViewButtonContext   // { topicId, siteOrigin }
  OUTPUT: boolean

  // The bug triggers whenever the "View" link is built from the hardcoded
  // host that omits the port, so the produced URL's port differs from the
  // port the app is actually served on.
  RETURN portOf(buildViewUrl(X.topicId)) <> portOf(X.siteOrigin)
END FUNCTION
```

### Property — Fix Checking

```pascal
// Property: Fix Checking - View URL preserves the site origin's port
FOR ALL X WHERE isBugCondition(X) DO
  result <- buildViewUrl'(X.topicId)
  ASSERT portOf(result) = portOf(X.siteOrigin)
     AND pathOf(result) = "/api/forum/topics/" + X.topicId + "/publichtml"
END FOR
```

### Property — Preservation Checking

```pascal
// Property: Preservation Checking - non-buggy inputs are unchanged
FOR ALL X WHERE NOT isBugCondition(X) DO
  ASSERT buildViewUrl(X.topicId) = buildViewUrl'(X.topicId)
END FOR
```

Where `buildViewUrl` is the original link construction (hardcoded host) and
`buildViewUrl'` is the fixed construction that derives the host and port from the
current site origin.

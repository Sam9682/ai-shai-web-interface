# Forum Format and Context Page Bugfix Design

## Overview

This spec bundles three related changes in `ai-shai-web-interface`. Only **PART 1** is a true
defect; **PART 2** and **PART 3** are behavior-additive changes captured here so they are
validated (and regression-guarded) alongside the fix.

- **PART 1 (Bug) — Forum rich-text formatting is not rendered.** After investigating the code,
  the defect is **presentational (CSS), not a data round-trip problem**. The `RichTextEditor`
  faithfully emits HTML, the backend stores and returns `content` untouched, and every display
  surface renders that HTML raw via `dangerouslySetInnerHTML`. The formatting is lost **visually**
  because the display containers style their content with Tailwind's `prose` utility classes,
  but the project runs **Tailwind CSS v4 with `plugins: []`** — the `@tailwindcss/typography`
  plugin that defines `prose` is **not installed**. As a result `prose` is a no-op, and
  Tailwind's Preflight base reset removes the default browser styling for headings, lists, and
  block spacing. Headings look like body text, lists lose their markers and indentation, and
  block elements collapse — so the applied formatting appears "not taken into account". The fix
  is to supply the missing block-level typography styling on the display surfaces (mirroring the
  scoped `<style>` the editor already ships internally), so saved HTML renders as intended.

  The general strategy: keep the storage/transport path untouched and add the missing
  presentational styling to the render path. This is minimal, targeted, and cannot regress the
  save/reload data flow because it changes only CSS.

- **PART 2 (Rename):** Change the visible prerequisites menu label from "Basics" to "Context"
  (French "Contexte"). Only the i18n label text changes — the route `/prerequisites/basics` and
  slug `basics` stay unchanged (see Fix Implementation and the naming-collision note below).

- **PART 3 (New page):** Add a new prerequisites page that displays client-environment, contact,
  and use-case scope information as label/value rows, following the existing prerequisites page
  patterns (route in `App.tsx`, entry in `PREREQ_NAV_ITEMS`, i18n labels in `translations.ts`,
  a thin page component delegating to a presentational component).

## Glossary

- **Bug_Condition (C)**: The condition that triggers the bug — Forum (and static-page) content
  that contains block-level rich-text markup (`<h1>`–`<h3>`, `<ul>`/`<ol>`/`<li>`, `<hr>`,
  block spacing) whose visual styling depends on `prose`.
- **Property (P)**: The desired behavior — saved formatted HTML is rendered with its formatting
  visible on every display surface, matching how it appears inside the editor.
- **Preservation**: Existing behavior that must not change — the HTML round-trip
  (compose → save → reload → render), plain-text posts, deletion/locking, and all existing
  prerequisites navigation, routes, and labels.
- **RichTextEditor**: The `contentEditable` component in
  `frontend/src/components/RichTextEditor.tsx`. It applies formatting via `document.execCommand`,
  emits `innerHTML` through `onChange`, and syncs `value → innerHTML` in a `useEffect` guarded by
  `isUpdatingRef` (reset with `setTimeout(0)`). It ships a scoped `<style>` block that styles
  `h1/h2/h3`, `ul/ol`, `img`, and `hr` **inside the editor only**.
- **Display surface**: A read-only container that renders stored HTML via
  `dangerouslySetInnerHTML` and relies on `prose` for styling. Three exist:
  `TopicDetailPage` post render, `StaticContentPage` read-only branch, and the editor's own
  contentEditable area (which already has its scoped styles).
- **`prose` (Tailwind Typography)**: A utility class set provided by `@tailwindcss/typography`.
  It is referenced throughout the UI but the plugin is **absent from `tailwind.config.js`
  (`plugins: []`)**, so the classes resolve to nothing.
- **Preflight**: Tailwind's base CSS reset (active via `@import "tailwindcss"` in `index.css`)
  that removes default margins, list markers, and heading sizing from raw HTML elements.
- **PREREQ_NAV_ITEMS**: The shared prerequisites navigation config in
  `frontend/src/components/prerequisites/types.ts` (labelKey + route + archetype), rendered by
  `Layout.tsx` for the dropdown and consumed by `App.tsx` routes.

## Bug Details

### Bug Condition

The bug manifests when a user views Forum content (a post or reply — and equally the static
prerequisites pages) that contains block-level formatting produced by the `RichTextEditor`
(headings, lists, horizontal rules, indentation). The stored HTML is correct, but the display
surface styles it with `prose`, and because the Tailwind Typography plugin is not installed,
`prose` produces no styling while Preflight has already stripped the browser defaults — so the
formatting is not visually rendered.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type ForumPostContent   // HTML string produced by RichTextEditor
  OUTPUT: boolean

  RETURN containsFormattingMarkup(input)          // <h1>..<h3>, <ul>/<ol>/<li>, <hr>, alignment/indent
         AND renderedOn(input, aProseDisplaySurface)
         AND NOT formattingIsVisiblyStyled(input) // prose is a no-op; Preflight stripped defaults
END FUNCTION
```

Note: the storage/transport is not part of the bug condition — `input` is already the correct
HTML at render time. The defect is purely in how that HTML is styled for display.

### Examples

- **New reply with a heading** — User selects text, clicks **H1**, saves. Expected: text renders
  large and bold. Actual: renders at body size (heading styling stripped by Preflight, `prose`
  no-op).
- **Bulleted list in an edited post** — User makes a `<ul>` list, saves the edit. Expected:
  bullet markers with indentation. Actual: list items render as plain lines with no bullets or
  indent.
- **Reload a formatted post** — Reopen a topic containing a saved `<h2>` + list. Expected:
  formatting shown as saved. Actual: HTML is present in the DOM (`dangerouslySetInnerHTML`) but
  appears unstyled.
- **Edge — bold/italic/underline only** — `<b>`, `<i>`, `<u>` may still appear correct because
  those are inline font properties Preflight does not fully neutralize; headings, lists, and
  block spacing are the clearly-broken cases. (This asymmetry is itself a strong signal that the
  problem is block-level `prose` styling, not the HTML content.)

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- The HTML content round-trip must stay identical: `RichTextEditor` emits the same `innerHTML`,
  `forumService` sends/receives `content: string` untouched, and the backend
  (`app/forum/router.py`, `schemas.py PostCreate.content: str`, `models/forum.py content: Text`)
  continues to store and return it without sanitization or transformation.
- Plain-text (unformatted) Forum posts continue to save and display correctly.
- Post deletion and topic locking behave exactly as before.
- The `StaticContentPage` (Basics / Network Flux) save flow is unchanged; its rendered content
  benefits from the same styling fix but its data path does not change.
- All existing prerequisites routes, slugs, and pages resolve and render unchanged.
- All other menu labels and translations (French and English) are unchanged.

**Scope:**
All inputs that do NOT depend on `prose`-styled block formatting are unaffected. This includes:
- Plain-text posts and inline-only formatting behavior
- The forum data/transport/persistence layers (frontend service + backend)
- Non-prerequisites UI and unrelated pages

The concrete correct behavior for buggy inputs is defined in the Correctness Properties section
(Property 1). This section defines what must NOT change.

## Hypothesized Root Cause

Investigated directly from the code. In order of confidence:

1. **Missing Tailwind Typography plugin (confirmed primary cause).**
   `tailwind.config.js` has `plugins: []` and `package.json` does not depend on
   `@tailwindcss/typography`, yet `TopicDetailPage`, `StaticContentPage`, and the editor all use
   `className="prose prose-sm max-w-none"`. Without the plugin these classes do nothing, and
   Tailwind Preflight (active via `@import "tailwindcss"`) has already reset heading sizes, list
   markers, and block margins. Net effect: block-level formatting is invisible on display.

2. **Editor-only scoped styling masks the problem while composing.**
   `RichTextEditor` ships an inline `<style>` covering `h1/h2/h3`, `ul/ol`, `img`, `hr` scoped to
   `[contenteditable]`. So formatting looks correct *inside the editor* but not on the read-only
   display surfaces, which have no equivalent styling — matching the reported symptom.

3. **Ruled out — value-sync effect clobbering formatting.** The `useEffect`
   (`editorRef.current.innerHTML = value`) is guarded by `isUpdatingRef`, which `handleInput`
   sets true before `onChange` and only clears on `setTimeout(0)`, i.e. after the synchronous
   re-render. So the effect does not overwrite user formatting during typing. (Preservation tests
   will confirm this stays true.)

4. **Ruled out — content escaped/stripped on render or in transit.** Display uses
   `dangerouslySetInnerHTML={{ __html: post.content }}` (raw, not escaped). `forumService` passes
   `content` through untouched, and the backend stores it as `Text` with no sanitization. The
   `MarkdownRenderer` regex component is only used by `OraclePage`, never the forum. So the HTML
   arrives intact at the DOM; only its styling is missing.

## Correctness Properties

Property 1: Bug Condition — Formatted content renders with visible formatting

_For any_ input where the bug condition holds (`isBugCondition` returns true — stored HTML
containing block-level formatting rendered on a `prose` display surface), the fixed application
SHALL render that content with its formatting visibly applied (headings sized and bold, lists
showing markers and indentation, horizontal rules and block spacing present), matching how the
content appears inside the `RichTextEditor`, without altering the stored HTML.

**Validates: Requirements 2.1, 2.2, 2.3, 3.3**

Property 2: Preservation — Data round-trip and unrelated flows unchanged

_For any_ input where the bug condition does NOT hold (`isBugCondition` returns false — plain-text
posts, the forum save/load transport, deletion, locking, and all existing prerequisites
navigation/routes/labels), the fixed application SHALL produce the same result as the original,
preserving the exact HTML content on the compose → save → reload → render path and all existing
behavior.

**Validates: Requirements 3.1, 3.2, 3.4, 3.5, 3.6**

## Fix Implementation

### PART 1 — Restore display formatting (the actual bug fix)

The goal is to make the `prose`-classed display surfaces actually style their block content,
without touching any data path. Two viable approaches; recommendation follows.

**Recommended approach — install and enable Tailwind Typography.**

**File**: `frontend/package.json`
1. Add `@tailwindcss/typography` as a devDependency (pinned to a version compatible with the
   installed `tailwindcss` v4.x).

**File**: `frontend/tailwind.config.js`
2. Register the plugin: `plugins: [require('@tailwindcss/typography')]` (or the v4 CSS-first
   equivalent `@plugin "@tailwindcss/typography";` in `index.css` if config-JS plugins are not
   honored under the v4 pipeline — verify which the toolchain uses).
   - Rationale: the codebase already annotates every display surface with
     `prose prose-sm max-w-none`, so enabling the plugin fixes all of them (Forum posts,
     StaticContentPage read-only, and the editor) with a single, low-risk change and no JSX edits.

**Fallback approach — scoped CSS (if adding the plugin is undesirable).**

**File**: `frontend/src/index.css` (or a small shared stylesheet)
- Add explicit rules for headings, lists, `hr`, and block spacing scoped to the rendered content
  containers (mirroring the editor's existing internal `<style>`). This avoids a new dependency
  but must be applied consistently to every display surface and kept in sync with the editor's
  block styles. Prefer the recommended approach unless a dependency is a problem.

**No changes** to: `RichTextEditor.tsx` (already emits correct HTML and styles the editor),
`TopicDetailPage.tsx` render markup, `forumService.ts`, or any backend file. The
`dangerouslySetInnerHTML` render stays as-is (formatting is authored HTML by design).

### PART 2 — Rename the "Basics" menu label to "Context" (label only)

**File**: `frontend/src/i18n/translations.ts`
1. Change the value of `prereq.nav.basics` in the **English** block from `Basics` to `Context`.
2. Change the value of `prereq.nav.basics` in the **French** block from `Basics` to `Contexte`.

**Unchanged (confirmed):** the key `prereq.nav.basics`, the route `/prerequisites/basics`, the
slug `basics`, `PREREQ_NAV_ITEMS` (still points at the same route/archetype), `BasicsPage`, and
`prerequisitesService` slug `basics`. Only the displayed text changes. This satisfies Req 2.4 and
preserves Req 3.5.

> Open question 2 — RESOLVED: **the route/slug stays unchanged.** Renaming only the label avoids
> breaking `/prerequisites/basics`, the persisted static-content slug `basics`, and existing
> tests (`prerequisitesService.test.ts`, `prerequisitesRoutes.test.tsx`). If a slug/route rename
> to `context` is later desired, it would be a separate change requiring server-content migration
> and is out of scope here.

> **Naming-collision note (for user review).** The user asked to (a) rename the "Basics" menu to
> "Context" and (b) add a new page that is essentially a client-environment "Context" page. Read
> literally these would produce **two** menu entries both meaning "Context". This design treats
> them as **two distinct entries** to avoid the collision:
> - PART 2 relabels the existing `basics` static page to **"Context" / "Contexte"** (unchanged
>   content archetype, route `/prerequisites/basics`).
> - PART 3 adds a **separate** entry for the new client-environment page (proposed label
>   **"Environnement client"** / **"Client Environment"**, route `/prerequisites/context`).
>
> This keeps both requests satisfiable without duplicate labels. If the user actually intends the
> new page to *replace* the "Basics" entry (i.e. "Context" == the new client-environment page),
> then PART 2 and PART 3 should be merged: skip the label-only rename and instead point the
> renamed entry at the new page. **Flagged for confirmation before implementation.**

### PART 3 — Add the new client-environment page

Follow the existing prerequisites archetype wiring.

**File**: `frontend/src/i18n/translations.ts`
1. Add a nav label key (e.g. `prereq.nav.context`) — EN "Client Environment", FR
   "Environnement client" (label wording to be confirmed alongside the collision note above).
   Add any page title/section/row labels needed by the page.

**File**: `frontend/src/components/prerequisites/types.ts`
2. Add an entry to `PREREQ_NAV_ITEMS`:
   `{ labelKey: 'prereq.nav.context', route: '/prerequisites/context', archetype: 'static' }`
   (archetype value depends on the editable-vs-static decision below).

**File**: new page component (e.g. `frontend/src/pages/ContextPage.tsx`) plus a presentational
component under `frontend/src/components/prerequisites/` (following the `HowToUse` read-only
pattern — a thin page delegating to a presentational component).
3. Render three sections as label/value rows with the specified pre-filled defaults:
   - **Client Environnement** — Nom du client (empty), Type de déploiement (empty),
     Site 1 Location (empty), Site 2 Location (empty), Installation wish date (empty),
     Managed / Air-gapped (default **"Managed"**).
   - **Contacts** — *OVH PSMC Architecte*: Nom (**"Samuel LEPETRE"**), Téléphone (empty),
     Email (**"samuel.lepetre@ovhcloud.com"**); *Client*: Nom (empty), Téléphone (empty),
     Email (empty).
   - **Use cases** — VCF (**"Within Scope"**), SUSE Harvester (**"Out of Scope"**),
     Nutanix (**"Out of Scope"**), IA (**"Out of Scope"**), Kubernetes (**"Out of Scope"**).

**File**: `frontend/src/App.tsx`
4. Import the new page and register `path="/prerequisites/context"` wrapped in `<ProtectedRoute>`
   (matching the other prerequisites routes).

> Open question 1 — RECOMMENDATION: **build a static, read-only display page** (like the
> `HowToUse` archetype) showing the label/value rows with the defaults. This matches the user's
> phrasing "add an empty page with the following fields" — the fields have fixed default values
> and no save affordance is requested. It is the simplest option and adds no persistence surface,
> service methods, or backend endpoints. If per-client editing/persistence is later needed, it is
> a **natural extension**: switch to the `static`/`qa` editable archetype and reuse
> `prerequisitesService` with a new slug (`context`). **Recommending static read-only; flagged
> for confirmation.**

## Testing Strategy

### Validation Approach

Two phases: first reproduce the formatting-loss on the unfixed build to confirm the CSS
root cause, then verify the fix renders formatting while preserving the untouched data
round-trip and all existing prerequisites behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing the fix, and
confirm the root cause is presentational (missing `prose`/typography styling) rather than a data
round-trip failure. If refuted, re-hypothesize.

**Test Plan**: Render a display surface (a `TopicDetailPage` post, or `StaticContentPage`
read-only) with known formatted HTML on the UNFIXED build and assert on both the DOM content and
the computed styling. The content assertions should PASS (HTML present) while the styling
assertions FAIL (headings/lists unstyled) — proving the defect is CSS, not content.

**Test Cases**:
1. **Heading not styled** — Render `<h1>Title</h1>` in a post; assert the `<h1>` exists in the
   DOM (passes) but is not visually sized/bold via `prose` (fails on unfixed build).
2. **List markers missing** — Render a `<ul><li>…</li></ul>`; assert the list nodes exist
   (passes) but have no marker/indent styling (fails on unfixed build).
3. **Static page parity** — Same assertions for `StaticContentPage` read-only render
   (Req 3.3 surface) (fails on unfixed build).
4. **Round-trip content integrity** — Assert the HTML string emitted by the editor equals the
   HTML rendered on display (should PASS even on the unfixed build, confirming content is intact).

**Expected Counterexamples**:
- Formatted HTML is present in the DOM but renders unstyled because `prose` resolves to nothing.
- Possible (ruled-out) alternatives the exploration disproves: content escaped on render, content
  stripped in transit/storage, value-sync effect clobbering the editor.

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed application renders
the formatting visibly.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  rendered := renderOnDisplaySurface_fixed(input)
  ASSERT formattingIsVisiblyStyled(rendered)   // headings sized, lists marked/indented, hr/spacing present
  ASSERT rendered.innerHTML == input           // stored HTML unchanged
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed application
produces the same result as the original.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT roundTrip_original(input) == roundTrip_fixed(input)   // compose->save->reload->render HTML identical
  ASSERT prereqNav_original == prereqNav_fixed                 // routes/slugs/archetypes unchanged
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation because it generates
many content strings and confirms the HTML round-trip is byte-identical across the input domain,
catching any accidental transformation introduced by the fix.

**Test Plan**: Observe round-trip and navigation behavior on the UNFIXED build first, then write
property-based and example tests capturing that behavior and assert it is unchanged after the fix.

**Test Cases**:
1. **Round-trip preservation (PBT)** — For arbitrary content strings, assert the value emitted by
   `RichTextEditor.onChange` survives `forumService.createPost`/`updatePost` mocks and is rendered
   identically — unchanged before and after the fix.
2. **Plain-text preservation** — A plain-text reply saves and displays identically (Req 3.1).
3. **Deletion / locking preservation** — Delete-post and locked-topic flows behave as before
   (Req 3.2).
4. **Prerequisites navigation preservation** — `/prerequisites/basics` and all other prerequisites
   routes still resolve to their pages; `PREREQ_NAV_ITEMS` routes/slugs/archetypes unchanged
   (Req 3.4, 3.5).
5. **Label preservation** — All menu labels other than the renamed one are unchanged in FR and EN
   (Req 3.6).

### Unit Tests

- PART 1: display surfaces render block formatting with visible styling after the fix (heading
  size/weight, list markers/indent, `hr`, block spacing) — `TopicDetailPage` post render and
  `StaticContentPage` read-only.
- PART 2: `prereq.nav.basics` resolves to "Context" (EN) / "Contexte" (FR); route/slug unchanged.
- PART 3: the new page renders the three sections with the exact label/value rows and pre-filled
  defaults; it is registered in `PREREQ_NAV_ITEMS` and routed in `App.tsx`.

### Property-Based Tests

- Generate arbitrary HTML/text content and assert the compose → save → reload → render HTML is
  identical before and after the fix (round-trip integrity / no sanitization introduced).
- Generate random content containing block formatting and assert it renders styled after the fix.

### Integration Tests

- Full forum flow: compose a formatted reply → save → reload topic → verify formatting is visible
  on display (Req 2.1, 2.3).
- Edit an existing formatted post → save → verify formatting persists and renders (Req 2.2).
- Navigate the prerequisites dropdown: the renamed "Context/Contexte" entry and the new
  client-environment page both appear and route correctly, while existing entries are unchanged.

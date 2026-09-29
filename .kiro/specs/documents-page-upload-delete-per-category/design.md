# Documents Page — Per-Category Upload, Admin Delete, Plain-Text Links Bugfix Design

## Overview

The Documents page (`frontend/src/pages/DocumentsPage.tsx`) currently exposes a
single global upload control at the top of the page, provides no way to delete
existing items, and renders `links`-category items as an anchor styled like a
solid button. This is a **frontend-only** change with three concerns:

1. **Per-category upload (UI grouping).** Replace the single global upload
   control with an admin-only upload control rendered *inside each category
   section*. Category assignment remains **server-derived from the file
   extension** — the per-section control is a UI convenience that opens the same
   file picker and posts to the same `POST /api/documents/upload` endpoint.
2. **Admin-only Delete.** Add a `documentService.deleteDocument(id)` method that
   calls the already-existing, admin-gated `DELETE /api/documents/{document_id}`
   endpoint, and render a Delete control next to each item, gated by
   `authService.isAdmin()`. Deleting refreshes the list.
3. **Plain-text links.** Restyle the `links` anchor from a button-styled anchor
   to a plain HTML hyperlink (link color, underline on hover, no background /
   rounding / padding), still opening `target_url` in a new tab with
   `rel="noopener noreferrer"`.

The fix strategy is minimal and targeted: no backend, schema, or migration
changes are required. The server remains the single authority on category
assignment and on role-based list filtering.

## Glossary

- **Bug_Condition (C)**: The condition that triggers the bug — an admin sees no
  per-section upload control, an admin sees no Delete control next to an item,
  or a `links` item with a usable target URL renders as a button-styled anchor.
- **Property (P)**: The desired post-fix behavior — each rendered section has an
  admin-only upload control, each rendered item has an admin-only Delete
  control, and a usable `links` item renders as a plain hyperlink opening its
  target URL.
- **Preservation**: Existing behavior that must remain unchanged — non-admins
  see no upload/delete controls; non-`links` items keep the Download button;
  `links` items without a usable `target_url` keep the Download fallback;
  category grouping/ordering, search filtering, and server-side extension-based
  category assignment plus role-based list filtering all stay the same.
- **DocumentsPage**: The React component in
  `frontend/src/pages/DocumentsPage.tsx` that lists documents grouped by
  category and renders upload/download controls.
- **documentService**: The client service in
  `frontend/src/services/documentService.ts` wrapping the documents API
  (`listDocuments`, `uploadDocument`, `downloadDocument`; `deleteDocument` is
  added by this fix).
- **authService.isAdmin()**: Returns `true` when `localStorage.user_role ===
  'administrator'`; `DocumentsPage` reads this as `isAdmin` to gate admin-only
  controls.
- **CATEGORY_MAPPING**: Server-side extension-to-category map
  (`app/models/document.py`); maps `documents` (`pdf`, `doc`, `docx`, `md`,
  `txt`), `scripts` (`sh`, `sql`, `py`), and `links` (`links`). No extension
  maps to `docs` or `trainings`.
- **usable target_url**: A `links` document whose `target_url` is a truthy
  string (`doc.category === 'links' && !!doc.target_url`); this drives the
  hyperlink-vs-Download-fallback branch.

## Bug Details

### Bug Condition

The bug manifests across three distinct UI states. (a) An administrator viewing
the page sees a single global upload control at the top and no upload control
within any rendered category section. (b) An administrator viewing a listed item
sees no Delete control, and `documentService` exposes no `deleteDocument` method
even though the backend endpoint exists. (c) A `links` item with a usable
`target_url` renders as an anchor styled like a solid button
(`bg-[#000E9C]`, `rounded`, padding, white text) rather than as a plain text
hyperlink.

**Formal Specification:**
```
FUNCTION isBugCondition(X)
  INPUT: X of type DocumentsPageState   // { isAdmin, renderedItem, hasPerSectionUploadControls }
  OUTPUT: boolean

  RETURN (X.isAdmin AND NOT X.hasPerSectionUploadControls)
      OR (X.isAdmin AND X.renderedItem.exists AND NOT X.renderedItem.hasDeleteControl)
      OR (X.renderedItem.category = 'links'
          AND X.renderedItem.hasUsableTargetUrl
          AND X.renderedItem.linkRendersAsButton)
END FUNCTION
```

### Examples

- **Per-section upload (admin).** Expected: each rendered section (e.g. Docs,
  Links, Scripts, Trainings) shows its own upload control. Actual: only a single
  global control appears above the sections; no section has an upload control.
- **Delete (admin).** Expected: each item shows a Delete control that removes it
  via `DELETE /api/documents/{document_id}` and refreshes the list. Actual: no
  Delete control exists and `documentService.deleteDocument` is undefined.
- **Delete (non-admin).** Expected: no Delete control is shown for any item.
  Actual: not applicable today (no control exists), but the fix must preserve
  the hidden state for non-admins.
- **Plain-text link.** For a `links` item `{ original_name: 'AWS Console',
  target_url: 'https://example.com' }`. Expected: a plain hyperlink (link
  color, hover underline, no button background) opening the URL in a new tab.
  Actual: an anchor styled like a solid blue button labeled
  `"Ouvrir le lien : AWS Console"`.
- **Edge case — link without usable URL.** For a `links` item with `target_url`
  missing/null/empty. Expected (unchanged): the Download button fallback.

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Non-admins (`isAdmin() === false`) see no upload controls and no Delete
  controls anywhere on the page.
- Non-`links` items (documents, scripts, trainings, docs) keep the Download
  button wired to `documentService.downloadDocument` / `GET
  /api/documents/{id}/download`.
- `links` items without a usable `target_url` keep the Download fallback rather
  than rendering a hyperlink.
- Category grouping and ordering (`CATEGORY_ORDER` first, then any remaining
  present categories) are unchanged.
- Case-insensitive search filtering by `original_name` and the empty-state
  message are unchanged.
- Server-side extension-based category assignment (`CATEGORY_MAPPING` via
  `classify_extension`) and role-based list filtering from `GET /api/documents`
  are unchanged; uploads from any section still land in their extension-derived
  category, and unmapped extensions are still rejected.

**Scope:**
All inputs that do NOT match the bug condition should be completely unaffected by
this fix. This includes:
- Non-admin viewers (no upload/delete controls rendered).
- Non-`links` items (Download button retained).
- `links` items without a usable `target_url` (Download fallback retained).
- The server contract for upload category derivation and list access filtering.

**Note:** The expected correct post-fix behavior is defined in the Correctness
Properties section (Property 1). This section focuses on what must NOT change.

## Hypothesized Root Cause

This is an enhancement rather than a defect from broken logic, so the "root
cause" is the current design of `DocumentsPage.tsx` and `documentService.ts`:

1. **Single global upload control.** The upload `<input>` / button and its
   single `fileInputRef` live above the section list, gated once by `isAdmin`.
   There is no per-section rendering of an upload control, and a single shared
   ref cannot back multiple simultaneous inputs.

2. **No delete capability.** `documentService` has no `deleteDocument` method,
   so the page cannot call the existing `DELETE /api/documents/{document_id}`
   endpoint, and no Delete control is rendered next to items.

3. **Button-styled links anchor.** The `links` branch renders an `<a>` with
   button classes (`px-3 py-1.5 ... text-white bg-[#000E9C] rounded
   hover:bg-[#4949FF] ...`) and a `"Ouvrir le lien : <name>"` label instead of
   plain-hyperlink styling.

4. **Per-section input ref management.** Moving upload into each section means
   one file input per section; a single `useRef` is insufficient. A keyed ref
   store (e.g. `Record<category, HTMLInputElement | null>` or a callback-ref
   map) is required so each section's button triggers its own input, and each
   input resets independently after a change.

## Correctness Properties

Property 1: Bug Condition - Per-section upload, admin delete, plain-text links

_For any_ input where the bug condition holds (isBugCondition returns true), the
fixed DocumentsPage SHALL:
- when `isAdmin` is true, render an upload control inside every rendered
  category section (posting via `POST /api/documents/upload` with the category
  remaining server-derived from the file extension);
- render a Delete control next to every rendered item when `isAdmin` is true
  (calling `documentService.deleteDocument(id)` → `DELETE
  /api/documents/{document_id}` then refreshing the list); and
- render a `links` item that has a usable `target_url` as a plain HTML hyperlink
  that opens the target URL in a new tab (with `rel="noopener noreferrer"`),
  not as a button-styled anchor.

**Validates: Requirements 2.1, 2.2, 2.4**

Property 2: Preservation - Non-buggy inputs behave identically

_For any_ input where the bug condition does NOT hold (isBugCondition returns
false), the fixed DocumentsPage SHALL produce the same result as the original,
preserving: non-admins see no upload/delete controls (2.3, 3.1); non-`links`
items keep the Download button (3.4); `links` items without a usable
`target_url` keep the Download fallback (3.5); server-side extension-based
category derivation on success and rejection of unmapped extensions (3.2, 3.3);
category grouping/ordering (3.6); and search filtering with the empty-state
message (3.7).

**Validates: Requirements 2.3, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7**

## Fix Implementation

### Changes Required

Assuming the root-cause analysis is correct, the changes are confined to two
frontend files plus translation keys.

**File**: `frontend/src/services/documentService.ts`

**Function**: add `deleteDocument`

**Specific Changes**:
1. **Add `deleteDocument(id: string): Promise<void>`**: issue `api.delete(
   \`/documents/${id}\`)` (resolving to `DELETE /api/documents/{document_id}`).
   Return void; let errors propagate so the page can surface a delete-error
   banner. Reuse the existing `uploadDocument(file)` signature for uploads
   (already `documentService.uploadDocument(file)` posting to
   `/documents/upload`).

**File**: `frontend/src/pages/DocumentsPage.tsx`

**Function**: `DocumentsPage` (render + handlers)

**Specific Changes**:
1. **Per-section upload control (admin only).**
   - Remove the single global upload block and its single `fileInputRef`.
   - Inside each rendered `<section>` (when `isAdmin`), render an upload control:
     a hidden/visible file `<input type="file">` plus an "Upload" button that
     triggers that section's input.
   - Back each section's input with a **per-category ref store** — e.g. a
     callback-ref map keyed by category (`Record<DocumentCategory,
     HTMLInputElement | null>`), so each button clicks its own input.
   - On change, call `documentService.uploadDocument(file)` then `loadDocuments()`
     to refresh; reset that section's input value so re-selecting the same file
     re-triggers change. Category stays server-derived; no client category
     param is sent. Surface the consequence: an upload from the Docs or
     Trainings section still lands in its extension-derived category (no
     extension maps to `docs`/`trainings`), and unmapped extensions are still
     rejected with the existing upload error.
   - **Error surfacing decision**: keep a single page-level `uploadError` banner
     (as today) since all sections post to the same endpoint and the error
     copy is generic; do not fragment into per-section banners. Give each
     section's input a distinct accessible label incorporating the category so
     tests and assistive tech can target the right control (e.g.
     `"<upload label> — <category label>"`).
2. **Admin-only Delete control.**
   - Add a `deleteError` state and a `handleDelete(doc)` handler that (optionally
     after confirmation) calls `documentService.deleteDocument(doc.id)` then
     `loadDocuments()`; on failure set a `deleteError` banner (mirroring the
     upload/download error pattern).
   - Render a Delete control next to each item, gated by `isAdmin`, alongside the
     existing Download/hyperlink control.
   - **Confirmation decision**: because delete is destructive and irreversible,
     require a confirmation step before calling the service (a `window.confirm`
     guard, or a small inline confirm). The chosen mechanism must be mockable in
     tests (prefer `window.confirm`, which vitest can stub).
3. **Plain-text links anchor.**
   - In the `isLink` branch, replace the button classes with plain-hyperlink
     styling: link color, `hover:underline`, no `bg-*`, no `rounded`, no
     padding. Keep `href={target_url}`, `target="_blank"`,
     `rel="noopener noreferrer"`. Keep the accessible name derived from
     `original_name` so `getByRole('link', { name: /.../ })` still resolves.
   - Preserve the Download fallback for `links` items without a usable
     `target_url` (`doc.category === 'links' && !!doc.target_url` gate unchanged).
4. **Translation keys.**
   - Add `page.documents.delete` (e.g. FR "Supprimer" / EN "Delete"),
     `page.documents.error.delete` (delete failure banner), and, if using a
     confirmation prompt, `page.documents.delete.confirm`. Add both FR and EN
     entries in `frontend/src/i18n/translations.ts` to match existing bilingual
     coverage. Reuse existing `page.documents.upload.*` and
     `page.documents.download` / `page.documents.openLink` keys.
5. **Preserve untouched logic.** Leave `loadDocuments`, `filtered`, `grouped`,
   `orderedCategories`, search state, and download handling unchanged so
   grouping/ordering, search filtering, and download behavior are preserved.

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples
that demonstrate the bug on unfixed code, then verify the fix works correctly and
preserves existing behavior. Tests reuse the existing frontend conventions from
`DocumentsPage.test.tsx` and `DocumentsPage.linksAnchor.bug.test.tsx`: mock
`documentService` and `authService`, render inside a `LanguageProvider` (default
French), use the `makeDocument` helper (extended to carry `target_url`), and use
`fast-check` with `NUM_RUNS = 100`. New mocks needed:
`documentService.deleteDocument` added to the `vi.mock` factory, and a stub for
the confirmation mechanism (e.g. `vi.spyOn(window, 'confirm')`).

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing
the fix. Confirm or refute the root-cause analysis. If refuted, re-hypothesize.

**Test Plan**: Write tests encoding the expected post-fix behavior and run them
against the UNFIXED code to observe failures for each concern.

**Test Cases**:
1. **Per-section upload (admin)**: with `isAdmin === true` and items across
   multiple categories, assert every rendered section exposes an upload control
   (targeted by its per-section accessible label) — will fail on unfixed code
   (only a single global control exists).
2. **Admin delete control present**: with `isAdmin === true` and a rendered
   item, assert a Delete control exists next to it — will fail on unfixed code.
3. **Delete wiring**: activating Delete (with confirmation stubbed to accept)
   calls `documentService.deleteDocument(doc.id)` then re-fetches the list — will
   fail on unfixed code (method/control absent).
4. **Plain-text link**: a `links` item with a usable `target_url` renders as a
   plain hyperlink (anchor with link styling, `href`/`target`/`rel` set) and NOT
   as a button-styled anchor — will fail on unfixed code (button styling).

**Expected Counterexamples**:
- No per-section upload control is found for admins.
- No Delete control is found for admins; `deleteDocument` is undefined.
- The `links` anchor carries button classes (`bg-[#000E9C]`, `rounded`, padding)
  instead of plain-hyperlink styling.
- Possible causes: single global upload control + single ref, missing
  `deleteDocument` method and Delete control, button-styled `links` branch.

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed
DocumentsPage produces the expected behavior.

**Pseudocode:**
```
FOR ALL X WHERE isBugCondition(X) DO
  result := DocumentsPage_fixed(X)
  // (a) admin: every rendered section has an upload control
  ASSERT X.isAdmin IMPLIES result.everyRenderedSection.hasUploadControl
  // (b) delete control visibility equals admin status; wired to deleteDocument
  ASSERT result.everyRenderedItem.hasDeleteControl = X.isAdmin
  // (c) usable links item is a plain hyperlink opening the target URL
  ASSERT (X.renderedItem.category = 'links' AND X.renderedItem.hasUsableTargetUrl)
         IMPLIES (result.renderedItem.isPlainHyperlink
                  AND result.renderedItem.opensTargetUrl
                  AND NOT result.renderedItem.linkRendersAsButton)
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the
fixed DocumentsPage produces the same result as the original.

**Pseudocode:**
```
FOR ALL X WHERE NOT isBugCondition(X) DO
  ASSERT DocumentsPage_original(X) = DocumentsPage_fixed(X)
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation
checking because:
- It generates many test cases automatically across the input domain.
- It catches edge cases that manual unit tests might miss.
- It provides strong guarantees that behavior is unchanged for all non-buggy
  inputs.

**Test Plan**: Observe behavior on UNFIXED code first for non-admin viewers,
non-`links` items, and `links` items without a usable URL, then write tests (unit
+ property-based) capturing that behavior so it is preserved after the fix.

**Test Cases**:
1. **Non-admin controls hidden**: with `isAdmin === false`, no upload control and
   no Delete control render for any item (property over arbitrary document
   lists). Validates 2.3, 3.1.
2. **Non-`links` Download preserved**: every non-`links` item renders the
   Download button wired to `downloadDocument(id, original_name)` (property over
   arbitrary lists). Validates 3.4.
3. **Links fallback preserved**: a `links` item with missing/null/empty
   `target_url` renders the Download button and no hyperlink. Validates 3.5.
4. **Upload category derivation / rejection preserved**: a successful upload
   refreshes the list and the item appears under its server-derived category; a
   failed upload (unmapped extension) shows the existing upload error banner and
   no client category param is sent. Validates 3.2, 3.3.
5. **Grouping/ordering preserved**: sections render in `CATEGORY_ORDER` then any
   remaining present categories (property: grouping is a partition by category).
   Validates 3.6.
6. **Search filtering preserved**: case-insensitive substring filter on
   `original_name`, all docs on empty query, and the empty-state message.
   Validates 3.7.

### Unit Tests

- Per-section upload control renders once per section for admins and not at all
  for non-admins; each section's button triggers its own input.
- `documentService.deleteDocument` calls `DELETE /api/documents/{id}` (service
  unit test with mocked `api`).
- Delete control: present for admins / absent for non-admins; on activation with
  confirmation accepted, calls `deleteDocument(id)` then refreshes; on failure
  shows the delete-error banner; when confirmation is cancelled, no service call.
- Plain-text link: anchor styling has no button classes and includes hover
  underline; `href`/`target`/`rel` set; Download fallback when no usable URL.
- Upload error and download error banners still render (regression).

### Property-Based Tests

- Delete control visibility equals `isAdmin` across arbitrary document lists.
- Non-admin viewers never see upload or delete controls across arbitrary lists.
- Every non-`links` item renders exactly one Download control (preservation).
- Any `links` item with a valid `https` `target_url` renders a plain hyperlink to
  that URL and no Download button; any `links` item without a usable URL renders
  the Download fallback.
- Grouping-is-a-partition and search-filter-subset properties continue to hold
  (reused from the existing suite).

### Integration Tests

- Full admin flow: upload from a section → list refresh → item appears under its
  extension-derived category; then delete that item (confirm) → list refresh →
  item disappears.
- Context/category switching: uploading from different sections routes to the
  same endpoint and each landed item appears under its server-assigned category.
- Link interaction: a usable `links` item renders a plain hyperlink that opens
  `target_url` in a new tab; a non-usable `links` item downloads via the
  fallback.

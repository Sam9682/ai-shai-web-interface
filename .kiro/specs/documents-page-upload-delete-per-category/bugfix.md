# Bugfix Requirements Document

## Introduction

The Documents page (`frontend/src/pages/DocumentsPage.tsx`) currently exposes a
single, global upload control at the top of the page, offers no way to delete
existing items, and renders `links`-category entries as an anchor styled like a
solid button. This enhancement changes the Documents page in three ways:

1. **Per-category upload.** Replace the single global upload control with an
   upload control inside each rendered category section, so an administrator can
   upload directly from the section for the type of content being added.
2. **Admin-only Delete.** Add a Delete control next to every document / link /
   script / training item, visible only to administrators, wired to the
   existing backend delete endpoint.
3. **Plain-text links.** Render `links`-category items as a plain HTML hyperlink
   (anchor with link styling, no button background or padding) that still opens
   the target URL, instead of an anchor styled like a button.

### Investigation findings (context for the requirements below)

- **Upload / category assignment.** `POST /api/documents/upload`
  (`app/documents/router.py`) derives the category **exclusively** from the
  uploaded file's extension via `classify_extension` in
  `app/models/document.py`; the request schema `DocumentUploadRequest`
  (`app/documents/schemas.py`) intentionally accepts only `access_level` and
  documents that "category is no longer client-supplied." `CATEGORY_MAPPING`
  maps extensions to only three categories: `documents` (`pdf`, `doc`, `docx`,
  `md`, `txt`), `scripts` (`sh`, `sql`, `py`), and `links` (`links`). There is
  **no extension mapping** to the `docs` or `trainings` categories.
  **Recommendation:** keep category assignment server-derived from the file
  extension and treat the per-section upload control as a UI grouping/convenience
  (each section's control opens the same file picker and posts to the same
  endpoint); do not add a client-supplied category parameter. This keeps the
  server the single authority on category, avoids a backend/schema/migration
  change, and preserves the existing rejection of unmapped extensions. A
  consequence to surface in the design: because no extension maps to `docs` or
  `trainings`, an upload from those sections still lands in its extension-derived
  category, and unmapped extensions are still rejected.
- **Delete endpoint.** `DELETE /api/documents/{document_id}`
  (`app/documents/router.py`) **already exists**, is admin-only (guarded by the
  `get_administrator` dependency), removes the stored file and metadata, writes
  an audit-log entry, and returns `DocumentDeleteResponse`. No backend change is
  required for delete. The frontend `documentService` (`documentService.ts`)
  currently has **no** `deleteDocument` method, so a client method must be added.
- **Admin determination (frontend).** `authService.isAdmin()`
  (`frontend/src/services/authService.ts`) returns `true` when the
  `user_role` value in `localStorage` equals `administrator`. `DocumentsPage`
  already reads `isAdmin` from this and uses it to gate the current global
  upload control.
- **Links rendering (current).** In `DocumentsPage.tsx`, a `links` item with a
  usable `target_url` renders as an `<a>` with classes
  `px-3 py-1.5 text-sm font-medium text-white bg-[#000E9C] rounded hover:bg-[#4949FF] ...`
  (button-like) and label `"Open link : <name>"`; every other item renders a
  Download button.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN an administrator views the Documents page THEN the system presents a single global upload control at the top and provides no upload control within each category section (Links, Scripts, Trainings, Documents, Docs).

1.2 WHEN any user (administrator or not) views a listed document, link, script, or training THEN the system provides no control to delete that item, and the frontend `documentService` exposes no `deleteDocument` method even though the backend `DELETE /api/documents/{document_id}` endpoint exists.

1.3 WHEN a `links`-category item with a usable target URL is rendered THEN the system displays it as an anchor styled like a solid button (`bg-[#000E9C]`, `rounded`, padding, white text) labeled `"Open link : <name>"`, rather than as a plain text hyperlink.

### Expected Behavior (Correct)

2.1 WHEN an administrator views the Documents page THEN the system SHALL present an upload control within each rendered category section instead of a single global control, and each section's control SHALL upload through `POST /api/documents/upload` (category remaining server-derived from the file extension, per the recommended approach).

2.2 WHEN an administrator views a listed document, link, script, or training THEN the system SHALL display a "Delete" control next to that item that, when activated, calls `DELETE /api/documents/{document_id}` via a new `documentService.deleteDocument` method and refreshes the list so the removed item disappears.

2.3 WHEN a user for whom `authService.isAdmin()` returns false views a listed item THEN the system SHALL NOT display the Delete control for any item.

2.4 WHEN a `links`-category item with a usable target URL is rendered THEN the system SHALL display it as a plain HTML hyperlink (an anchor with text/link styling and no button background or padding) that opens the target URL.

### Unchanged Behavior (Regression Prevention)

3.1 WHEN a user for whom `authService.isAdmin()` returns false views the Documents page THEN the system SHALL CONTINUE TO hide all upload controls.

3.2 WHEN an administrator uploads a file whose extension is mapped in `CATEGORY_MAPPING` THEN the system SHALL CONTINUE TO derive the category from the file extension server-side and, on success, refresh the list so the item appears within its assigned category.

3.3 WHEN an administrator uploads a file whose extension is not present in `CATEGORY_MAPPING` THEN the system SHALL CONTINUE TO reject the upload with an error response and surface the existing upload error message.

3.4 WHEN a non-`links` item (documents, scripts, trainings, docs) is rendered THEN the system SHALL CONTINUE TO display the Download button wired to `documentService.downloadDocument` / `GET /api/documents/{id}/download`.

3.5 WHEN a `links` item has no usable target URL (missing, unreadable, or empty `.links` file) THEN the system SHALL CONTINUE TO fall back to the Download button rather than rendering a hyperlink.

3.6 WHEN documents are listed THEN the system SHALL CONTINUE TO group and order them by category (`CATEGORY_ORDER` first, then any remaining present categories) and apply the existing role-based access filtering from `GET /api/documents`.

3.7 WHEN a user searches the document list THEN the system SHALL CONTINUE TO filter items by `original_name` (case-insensitive) and show the empty-state message when no items match.

## Deriving the Bug Condition

The three changes affect distinct inputs; the bug condition is the union of the
UI states that must change, expressed per concern below.

### Bug Condition

```pascal
FUNCTION isBugCondition(X)
  INPUT: X of type DocumentsPageState   // { isAdmin, renderedItem, sectionUploadControls }
  OUTPUT: boolean

  // (a) Admin sees only a single global upload control (no per-section controls)
  // (b) Admin sees no Delete control next to a rendered item
  // (c) A links item with a usable target_url renders as a button-styled anchor
  RETURN (X.isAdmin AND NOT X.hasPerSectionUploadControls)
      OR (X.isAdmin AND X.renderedItem.exists AND NOT X.renderedItem.hasDeleteControl)
      OR (X.renderedItem.category = 'links'
          AND X.renderedItem.hasUsableTargetUrl
          AND X.renderedItem.linkRendersAsButton)
END FUNCTION
```

### Property (Fix Checking)

```pascal
// Property: Fix Checking - per-section upload, admin delete, plain-text links
FOR ALL X WHERE isBugCondition(X) DO
  result ← DocumentsPage'(X)

  // (a) Each rendered category section exposes its own upload control (admin only)
  ASSERT X.isAdmin IMPLIES result.everyRenderedSection.hasUploadControl

  // (b) Every rendered item shows a Delete control for admins, hidden for non-admins
  ASSERT result.everyRenderedItem.hasDeleteControl = X.isAdmin

  // (c) A links item with a usable URL renders as a plain hyperlink, not a button
  ASSERT (X.renderedItem.category = 'links' AND X.renderedItem.hasUsableTargetUrl)
         IMPLIES (result.renderedItem.isPlainHyperlink
                  AND result.renderedItem.opensTargetUrl
                  AND NOT result.renderedItem.linkRendersAsButton)
END FOR
```

### Preservation (Preservation Checking)

```pascal
// Property: Preservation Checking - non-buggy inputs behave identically
FOR ALL X WHERE NOT isBugCondition(X) DO
  ASSERT DocumentsPage(X) = DocumentsPage'(X)
END FOR
```

Where **F** = `DocumentsPage` before the change and **F'** = `DocumentsPage`
after. Preserved cases include: non-admin viewers (no upload, no delete
controls); non-`links` items (Download button); `links` items without a usable
`target_url` (Download fallback); category grouping/ordering; search filtering;
and server-side extension-based category assignment and role-based list
filtering.

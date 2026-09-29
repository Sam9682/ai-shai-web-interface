# Bugfix Requirements Document

## Introduction

On the Documents page, every document is rendered with a "Download" button, regardless of its category. For documents in the `links` category, the stored file (a `.links` file) contains a target URL as plain text (for example `https://example.com`) rather than a downloadable asset. When a user clicks "Download" for a link document, the browser downloads the `.links` text file instead of navigating to the URL the document represents.

The expected behavior is that `links`-category documents render as a clickable HTML anchor that opens the target URL in a new tab, while all other categories (`docs`, `documents`, `scripts`, `trainings`) keep the existing "Download" button behavior.

Investigation findings that establish the bug condition:
- Frontend `frontend/src/pages/DocumentsPage.tsx` renders a Download button for every document via `handleDownload` → `documentService.downloadDocument` (GET `/api/documents/{id}/download`, retrieved as a blob).
- Backend `app/models/document.py` maps the `.links` extension to `DocumentCategory.LINKS`.
- The stored `.links` file content is a single plain-text URL (confirmed in `storage/uploads/*.links`, each containing a URL such as `https://example.com`).
- The document list API (`DocumentResponse` in `app/documents/schemas.py`) currently exposes only metadata (`id`, `filename`, `original_name`, `mime_type`, `size`, `category`, `access_level`, `uploaded_by`, `download_count`, `created_at`, `updated_at`). The target URL is not exposed by the list API today; it is only obtainable through the download/file content endpoint.

The bug condition is: the document belongs to the `links` category. For such documents the correct behavior is to present a link, not a download.

## Bug Analysis

### Current Behavior (Defect)

The Documents page treats link documents identically to file documents, so the URL a link document points to is never navigable from the UI.

1.1 WHEN a document in the `links` category is listed on the Documents page THEN the system renders a "Download" button instead of a clickable link
1.2 WHEN a user clicks the control for a `links` document THEN the system downloads the `.links` file (the raw URL text) instead of navigating the user to the target URL
1.3 WHEN a `links` document is displayed THEN the system does not surface the target URL contained in the document file to the user

### Expected Behavior (Correct)

Link documents present the target URL as an anchor that navigates the user to that URL.

2.1 WHEN a document in the `links` category is listed on the Documents page THEN the system SHALL render a clickable HTML anchor (link) instead of a "Download" button
2.2 WHEN a user clicks the anchor for a `links` document THEN the system SHALL open the document's target URL in a new browser tab (with `rel="noopener noreferrer"` for safe external navigation)
2.3 WHEN a `links` document is rendered THEN the system SHALL obtain the target URL defined in the document file so it can be used as the anchor's destination

### Unchanged Behavior (Regression Prevention)

All non-link categories keep the current download behavior, and shared list/search/access-control behavior is unaffected.

3.1 WHEN a document in a non-`links` category (`docs`, `documents`, `scripts`, `trainings`) is listed THEN the system SHALL CONTINUE TO render the "Download" button
3.2 WHEN a user clicks "Download" for a non-`links` document THEN the system SHALL CONTINUE TO download the file via the existing download flow
3.3 WHEN the Documents page groups documents into category sections THEN the system SHALL CONTINUE TO order and group all categories as it does today
3.4 WHEN a user searches or filters documents THEN the system SHALL CONTINUE TO filter by `original_name` as it does today
3.5 WHEN documents are listed THEN the system SHALL CONTINUE TO enforce the existing role-based access control for the list and download endpoints

## Bug Condition and Property

**Key definitions**
- **F**: The Documents page rendering as it exists before the fix.
- **F'**: The Documents page rendering after the fix.

**Bug Condition** — identifies documents that trigger the bug:

```pascal
FUNCTION isBugCondition(doc)
  INPUT: doc of type Document
  OUTPUT: boolean

  // A links-category document is rendered incorrectly (as a Download button)
  RETURN doc.category = 'links'
END FUNCTION
```

**Property (Fix Checking)** — desired behavior for buggy documents:

```pascal
// Property: Fix Checking - Links render as an anchor to the target URL
FOR ALL doc WHERE isBugCondition(doc) DO
  rendered ← F'(doc)
  ASSERT isAnchor(rendered)
    AND rendered.href = targetUrl(doc)
    AND rendered.target = "_blank"
    AND NOT isDownloadButton(rendered)
END FOR
```

**Preservation (Preservation Checking)** — non-link documents are unchanged:

```pascal
// Property: Preservation Checking - Non-links render exactly as before
FOR ALL doc WHERE NOT isBugCondition(doc) DO
  ASSERT F(doc) = F'(doc)   // still a Download button with existing download flow
END FOR
```

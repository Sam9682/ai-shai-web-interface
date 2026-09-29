# Documents Page Categories Bugfix Design

## Overview

Files published from `docs/to_publish` are seeded into the `documents` table and rendered on the Documents page grouped by category. Today the whole pipeline collapses every seeded file into a single `documents` category:

- The seeder (`app/services/document_seed_service.py`) scans only the top level of `docs/to_publish` (`discover_source_files` uses `iterdir`, non-recursive) and `infer_category` hard-codes `DocumentCategory.DOCUMENTS`.
- The category domain (`app/models/document.py`) is an extension-derived enum with only `DOCUMENTS`, `SCRIPTS`, `LINKS`, so there is no representation for the originating subfolder.
- The frontend (`DocumentsPage.tsx`) hard-codes `CATEGORY_ORDER = ['documents','scripts','links']` and a fixed `grouped` map, and `documentService.ts` types `category` as the same closed union.

The real source folder is organized into subfolders — `docs`, `links`, `scripts`, `trainings` (plus `movies`, `images`) — and each subfolder is meant to be its own category section.

The fix changes the classification signal from *file extension* to *originating subfolder*. The seeder will recurse into the four content subfolders and record each file's originating subfolder as its category. The category domain expands to include `docs` and `trainings`. The API keeps grouping/RBAC exactly as-is (it already groups by the `category` field). The frontend stops hard-coding the category set and instead derives category sections dynamically from the categories present in the returned documents, ordered by a known subfolder order. Search, download, upload, RBAC, and empty-state behavior are preserved.

## Glossary

- **Bug_Condition (C)**: The condition that triggers the bug — a file published from `docs/to_publish` whose originating subfolder is one of `docs`, `links`, `scripts`, `trainings`. Such a file is misgrouped because the system classifies by extension and collapses everything into `documents`.
- **Property (P)**: The desired behavior — each such file is assigned the category equal to its originating subfolder, and that category is rendered as its own section on the Documents page.
- **Preservation**: Existing search, download, upload, RBAC (public/members/administrators), empty-category omission, and empty-state behavior that must remain unchanged by the fix.
- **Originating_Subfolder**: The immediate subfolder of `docs/to_publish` a file was discovered in (e.g. `trainings` for `docs/to_publish/trainings/onboarding.md`).
- **`discover_source_files`**: The function in `app/services/document_seed_service.py` that enumerates files to seed. Currently non-recursive and returns bare `Path`s.
- **`infer_category`**: The function in `app/services/document_seed_service.py` that assigns a `DocumentCategory` to a seeded file. Currently hard-codes `DOCUMENTS`.
- **`DocumentCategory`**: The enum in `app/models/document.py` defining the category domain. Currently `{documents, scripts, links}`.
- **`Document.category`**: The persisted column that both the API grouping/filter and the frontend grouping key off of.
- **`CATEGORY_ORDER` / `grouped`**: The static category list and grouping map in `frontend/src/pages/DocumentsPage.tsx` that render one section per category.

## Bug Details

### Bug Condition

The bug manifests when a file published from `docs/to_publish` lives in one of the content subfolders (`docs`, `links`, `scripts`, `trainings`). The seeding pipeline is either (a) not discovering the file at all because it only scans the top level, or (b) discovering it but discarding its originating subfolder and assigning the fixed `documents` category. As a result the Documents page cannot render a section per subfolder — it shows a single "Documents" section (or omits subfolder files entirely).

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type DocumentFile   // a file published from docs/to_publish
  OUTPUT: boolean

  RETURN input.originatingSubfolder IN {"docs", "links", "scripts", "trainings"}
         AND assignedCategory(input) != input.originatingSubfolder
END FUNCTION
```

Where `assignedCategory(input)` is the category the current system stores/renders for the file. Under the current code every discovered file has `assignedCategory == "documents"`, so the condition holds for any file whose originating subfolder is not `documents`, and (via the non-recursive scan) subfolder files may not be surfaced at all.

### Examples

- `docs/to_publish/trainings/onboarding.md` — Expected: appears under a `trainings` category section. Actual: not surfaced (subfolder not scanned) or, if seeded, shown under a single "Documents" section.
- `docs/to_publish/links/useful-links.links` — Expected: appears under a `links` category section grouped with other link files. Actual: collapsed into "Documents" (category hard-coded), never rendered as `links`.
- `docs/to_publish/scripts/deploy.sh` — Expected: appears under a `scripts` category section. Actual: collapsed into "Documents".
- `docs/to_publish/docs/spec.pdf` — Expected: appears under a `docs` category section. Actual: shown under "Documents"; there is coincidental overlap in label but the grouping is by extension, not subfolder.
- Edge case: `docs/to_publish/movies/intro.mp4` and `docs/to_publish/images/logo.png` — These subfolders are out of scope for categories; the fix SHALL NOT introduce `movies`/`images` category sections (see Scope).

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Filename search SHALL continue to filter displayed files to those whose `original_name` matches the query (Requirement 3.1).
- File download SHALL continue to download the correct file by its `original_name` via the existing download endpoint (Requirement 3.2).
- Admin upload SHALL continue to accept the upload and refresh the list so the new file appears (Requirement 3.3).
- Role-based access control (public/members/administrators) SHALL continue to filter which documents a user can list and download (Requirement 3.4).
- A category section that contains no files after filtering SHALL continue to be omitted (Requirement 3.5).
- When no files match the current view, the existing empty-state message SHALL continue to be shown (Requirement 3.6).

**Scope:**
All inputs that do NOT involve subfolder-based grouping should be completely unaffected by this fix. This includes:
- The filename search interaction and its matching semantics.
- The download flow (endpoint, access checks, filename).
- The upload flow (admin-only, extension validation, list refresh).
- RBAC filtering on list and download.
- The empty-category and empty-state rendering.
- Subfolders that are not content categories (`movies`, `images`) — these SHALL NOT become category sections.

**Note:** The actual expected correct grouping behavior is defined in the Correctness Properties section (Property 1). This section enumerates what must NOT change.

## Hypothesized Root Cause

Based on the bug description and the code, the defect spans four layers:

1. **Non-recursive discovery**: `discover_source_files(docs_dir)` uses `docs_dir.iterdir()` filtered to `p.is_file()`, so it only sees top-level files and never descends into `docs`, `links`, `scripts`, `trainings`. Subfolder files are omitted from seeding.
   - The originating subfolder is never captured because discovery returns bare `Path` objects.

2. **Hard-coded category inference**: `infer_category(filename)` ignores the file entirely and returns `DocumentCategory.DOCUMENTS`. Even if subfolder files were discovered, they would all be labeled `documents`.

3. **Insufficient category domain**: `DocumentCategory` only defines `documents`, `scripts`, `links`. There is no `docs` or `trainings` member, so the originating subfolder cannot be represented or persisted.

4. **Static frontend grouping**: `DocumentsPage.tsx` hard-codes `CATEGORY_ORDER` and a fixed `grouped` map keyed by the three-value union in `documentService.ts`. Even with correct backend data, unknown categories (`docs`, `trainings`) would be dropped and never rendered.

The API layer (`app/documents/router.py`) is NOT a root cause: it already groups/filters by `Document.category` and applies RBAC. It only needs to keep working against the expanded category domain.

## Correctness Properties

Property 1: Bug Condition - Files Grouped By Originating Subfolder

_For any_ file published from `docs/to_publish` where the bug condition holds (`isBugCondition` returns true — its originating subfolder is one of `docs`, `links`, `scripts`, `trainings`), the fixed pipeline SHALL assign that file the category equal to its originating subfolder, and the Documents page SHALL render that category as its own section with the file nested inside it.

**Validates: Requirements 2.1, 2.2, 2.3, 2.4**

Property 2: Preservation - Behavior Unrelated To Subfolder Grouping

_For any_ input where the bug condition does NOT hold (`isBugCondition` returns false — e.g. filename search, download, upload, RBAC evaluation, empty-category omission, empty-state rendering, and non-content subfolders such as `movies`/`images`), the fixed code SHALL produce the same observable result as the original code, preserving all existing document-page functionality.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct, the fix touches the category domain, the seeder, the frontend service types, and the Documents page. The API grouping/RBAC needs no logic change (only the wider enum flows through).

**File**: `app/models/document.py`

**Symbol**: `DocumentCategory`

**Specific Changes**:
1. **Expand the category domain**: Add `DOCS = "docs"` and `TRAININGS = "trainings"` to `DocumentCategory` so the originating subfolders `docs`, `links`, `scripts`, `trainings` are all representable and persistable.
   - Keep the existing `documents`, `scripts`, `links` members so already-seeded rows and extension-based uploads remain valid.
   - Because the column uses `SQLEnum(..., native_enum=False)`, the values are stored as strings and no native DB enum ALTER is required; confirm no additional migration is needed beyond allowing the new string values. If a migration/backfill is desired for existing rows, plan it as an optional follow-up (out of scope for the grouping fix itself).

**File**: `app/services/document_seed_service.py`

**Symbols**: `discover_source_files`, `infer_category`, `_seed_single_file`

**Specific Changes**:
2. **Recurse into content subfolders and retain the originating subfolder**: Change `discover_source_files` to walk the four content subfolders (`docs`, `links`, `scripts`, `trainings`) of `docs/to_publish` and return each file paired with its originating subfolder name (e.g. a list of `(Path, subfolder_name)` tuples). Restrict discovery to those four subfolders so `movies` and `images` are excluded.
3. **Infer category from the originating subfolder**: Change `infer_category` to accept the originating subfolder (or the pair) and return the corresponding `DocumentCategory` member instead of hard-coding `DOCUMENTS`.
4. **Thread the subfolder through seeding**: Update `_seed_single_file` (and `seed_docs_folder`'s loop) to pass the originating subfolder so the created `Document.category` reflects it. Preserve the existing behavior of leaving `category` untouched on re-sync of an unchanged/changed existing row (to respect manual reclassification), matching current code.

**File**: `frontend/src/services/documentService.ts`

**Symbol**: `DocumentCategory` (type)

**Specific Changes**:
5. **Widen the category type**: Extend the `DocumentCategory` union to `'documents' | 'scripts' | 'links' | 'docs' | 'trainings'` so the four subfolder categories are typed. Keep `documents` in the union for backward compatibility with any legacy rows.

**File**: `frontend/src/pages/DocumentsPage.tsx`

**Symbols**: `CATEGORY_LABEL_KEYS`, `CATEGORY_ORDER`, `grouped`, render block

**Specific Changes**:
6. **Add label keys for new categories**: Add `docs` and `trainings` entries to `CATEGORY_LABEL_KEYS` mapping to new translation keys (`page.documents.category.docs`, `page.documents.category.trainings`).
7. **Order by subfolder, render dynamically**: Replace the hard-coded three-value `CATEGORY_ORDER` with the intended subfolder order (`docs`, `links`, `scripts`, `trainings`) while still tolerating any legacy `documents` category (render it if present). Build `grouped` from the categories actually present in `filtered` rather than a fixed literal map, so unknown-but-valid categories are not dropped. Continue to omit empty category sections (Requirement 3.5) and preserve the existing empty-state branch (Requirement 3.6).

**File**: `frontend/src/i18n/translations.ts`

**Specific Changes**:
8. **Add translations**: Add French and English strings for `page.documents.category.docs` and `page.documents.category.trainings` alongside the existing category labels.

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bug on the unfixed code (subfolder files collapsed into one `documents` category or omitted entirely), then verify the fix groups by originating subfolder and preserves search, download, upload, RBAC, and empty-state behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing the fix, and confirm or refute the root-cause hypotheses (non-recursive discovery, hard-coded category, insufficient enum, static frontend grouping). If refuted, re-hypothesize.

**Test Plan**: Seed a temporary `docs/to_publish` fixture containing files across `docs`, `links`, `scripts`, `trainings` (plus `movies`/`images` to confirm exclusion). Run the seeder and inspect the persisted `Document.category` values. Separately, render `DocumentsPage` with documents carrying `docs`/`trainings` categories and assert the sections. Run against the UNFIXED code to observe failures.

**Test Cases**:
1. **Recursive discovery test**: Assert `discover_source_files` finds files inside `docs/to_publish/trainings` (will fail on unfixed code — non-recursive).
2. **Category inference test**: Assert a file under `trainings` seeds with `category == trainings` (will fail on unfixed code — hard-coded `documents`).
3. **Frontend section test**: Render the page with a `trainings` document and assert a `trainings` section is present (will fail on unfixed code — category dropped by static `CATEGORY_ORDER`/`grouped`).
4. **Exclusion edge case**: Place a file under `movies`/`images` and assert it does NOT become a category section (may behave incorrectly pre-fix if any recursion is added naively).

**Expected Counterexamples**:
- Files under `docs`/`links`/`scripts`/`trainings` are all persisted with `category == documents`, or subfolder files are missing entirely.
- Possible causes: non-recursive `discover_source_files`, hard-coded `infer_category`, missing enum members, static frontend grouping.

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed pipeline assigns the category equal to the originating subfolder and renders that category section.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  result := seedAndRender_fixed(input)
  ASSERT result.category = input.originatingSubfolder
  ASSERT categorySectionRendered(result.category) = TRUE
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed code produces the same observable result as the original code.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT behavior_original(input) = behavior_fixed(input)
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many test cases automatically across the input domain (varied filenames, access levels, roles, search queries).
- It catches edge cases that manual unit tests might miss.
- It provides strong guarantees that behavior is unchanged for all non-buggy inputs.

**Test Plan**: Observe search/download/upload/RBAC/empty-state behavior on the UNFIXED code, then write tests (property-based where practical) capturing that behavior and re-run after the fix.

**Test Cases**:
1. **Search preservation**: Observe that filename search filters displayed files on unfixed code, then verify it still filters after the fix (Requirement 3.1).
2. **Download preservation**: Observe that download returns the correct file by `original_name` on unfixed code, then verify it is unchanged after the fix (Requirement 3.2).
3. **Upload preservation**: Observe that an admin upload is accepted and the list refreshes on unfixed code, then verify it is unchanged after the fix (Requirement 3.3).
4. **RBAC preservation**: Observe that list/download respect public/members/administrators on unfixed code, then verify it is unchanged for the expanded category domain (Requirement 3.4).
5. **Empty-category / empty-state preservation**: Observe that empty category sections are omitted and the empty-state message shows when nothing matches, then verify both are unchanged (Requirements 3.5, 3.6).

### Unit Tests

- `discover_source_files` recurses into `docs`, `links`, `scripts`, `trainings` and returns each file with its originating subfolder; excludes `movies`/`images`.
- `infer_category` maps each subfolder name to the matching `DocumentCategory`.
- `DocumentCategory` includes `docs`, `links`, `scripts`, `trainings` (and retains `documents`).
- `DocumentsPage` renders a section per present category in the intended order, omits empty categories, and shows the empty-state when no files match.
- Category label rendering uses the new translation keys for `docs` and `trainings`.

### Property-Based Tests

- Generate document lists with randomized categories (including `docs`/`trainings`), access levels, and names; assert each document renders under a section equal to its category and that no section is created for a category with zero matching (filtered) files.
- Generate randomized search queries and assert the filtered set matches the substring semantics unchanged (preservation).
- Generate randomized (role, access_level) combinations and assert the RBAC list/download outcome is unchanged by the category expansion (preservation).

### Integration Tests

- Full seed-to-page flow: seed a fixture `docs/to_publish` with files across all four subfolders, call the list API as different roles, and assert the page renders one section per subfolder with the correct files nested and RBAC applied.
- Context/interaction flow: perform a search that narrows to a single category and assert only the matching section renders; clear the search and assert all populated sections return.
- Upload flow: as admin, upload a supported file and assert the list refreshes and the file appears under its extension-derived category, confirming upload behavior is preserved alongside the new subfolder grouping.

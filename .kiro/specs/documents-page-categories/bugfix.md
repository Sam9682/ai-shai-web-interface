# Bugfix Requirements Document

## Introduction

On the Documents page, files sourced from `docs/to_publish` are all shown under a single category labeled "Documents", presenting a flat list that ignores the folder structure. The publication source `docs/to_publish` is organized into subfolders (`docs`, `links`, `scripts`, `trainings`), and each subfolder is intended to be its own category. Because both the discovery/classification logic and the page grouping collapse everything into one category, users cannot see which files belong to which subfolder.

This bugfix makes the Documents page group files by their originating subfolder under `docs/to_publish`, rendering one category section per subfolder (`docs`, `links`, `scripts`, `trainings`) with the relevant files nested inside each category, while preserving existing behavior for search, download, upload, and access control.

## Bug Analysis

### Current Behavior (Defect)

When files exist across the subfolders of `docs/to_publish` (`docs`, `links`, `scripts`, `trainings`), the system fails to reflect that structure and instead shows everything under one category.

1.1 WHEN the Documents page loads with files that originate from multiple subfolders of `docs/to_publish` THEN the system displays only a single category labeled "Documents" containing a flat list of all files
1.2 WHEN files reside in the `docs/to_publish/docs`, `docs/to_publish/links`, `docs/to_publish/scripts`, or `docs/to_publish/trainings` subfolders THEN the system classifies them by file extension into the fixed set `documents`/`scripts`/`links` rather than by their originating subfolder
1.3 WHEN files reside in subfolders of `docs/to_publish` THEN the system does not surface them as belonging to a `docs` or `trainings` category (no such category exists), so those subfolders are never rendered as their own section
1.4 WHEN the source folder is scanned for files to publish THEN the system enumerates only top-level files and does not recurse into the subfolders, so subfolder files may be omitted or ungrouped

### Expected Behavior (Correct)

The Documents page reflects the subfolder structure of `docs/to_publish`, with one category per subfolder.

2.1 WHEN the Documents page loads with files that originate from multiple subfolders of `docs/to_publish` THEN the system SHALL display one category section per originating subfolder (`docs`, `links`, `scripts`, `trainings`) instead of a single "Documents" category
2.2 WHEN a file resides in a given subfolder of `docs/to_publish` THEN the system SHALL assign that file to the category corresponding to its originating subfolder (e.g. a file under `docs/to_publish/trainings` belongs to the `trainings` category)
2.3 WHEN a category (subfolder) contains one or more files THEN the system SHALL render that category as a section with its files nested inside it
2.4 WHEN the source folder is scanned for files to publish THEN the system SHALL discover files within the `docs`, `links`, `scripts`, and `trainings` subfolders and retain each file's originating subfolder so it can be grouped by category

### Unchanged Behavior (Regression Prevention)

Existing document-page functionality unrelated to subfolder grouping must remain intact.

3.1 WHEN a user searches by filename THEN the system SHALL CONTINUE TO filter the displayed files to those whose name matches the query
3.2 WHEN a user downloads a file THEN the system SHALL CONTINUE TO download the correct file by its original name
3.3 WHEN an administrator uploads a file THEN the system SHALL CONTINUE TO accept the upload and refresh the list so the new file appears
3.4 WHEN documents are listed THEN the system SHALL CONTINUE TO apply role-based access control (public/members/administrators) so users only see files they are permitted to access
3.5 WHEN a category section contains no files after filtering THEN the system SHALL CONTINUE TO omit that empty category section
3.6 WHEN no files match the current view THEN the system SHALL CONTINUE TO show the existing empty-state message

## Bug Condition and Properties

The following pseudocode derives the bug condition and the fix/preservation properties. `F` is the current behavior (classification + grouping); `F'` is the fixed behavior.

### Bug Condition

```pascal
FUNCTION isBugCondition(X)
  INPUT: X of type DocumentFile   // a file published from docs/to_publish
  OUTPUT: boolean

  // The bug manifests for any file whose true grouping is its originating
  // subfolder under docs/to_publish, since the current system groups by the
  // fixed extension-derived category set and never reflects the subfolder.
  RETURN X.originatingSubfolder IN {"docs", "links", "scripts", "trainings"}
END FUNCTION
```

### Property: Fix Checking

```pascal
// For every published file, the fixed system groups it under a category equal
// to its originating subfolder, and renders that category as its own section.
FOR ALL X WHERE isBugCondition(X) DO
  result ← F'(X)
  ASSERT result.category = X.originatingSubfolder
  ASSERT categorySectionRendered(result.category) = TRUE
END FOR
```

### Property: Preservation Checking

```pascal
// For inputs unrelated to subfolder grouping (search, download, upload,
// access control, empty-state), the fixed system behaves identically to the
// original.
FOR ALL X WHERE NOT isBugCondition(X) DO
  ASSERT F(X) = F'(X)
END FOR
```

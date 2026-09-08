# Requirements Document

## Introduction

This feature automatically publishes the files stored in the repository `docs/` folder as downloadable documents within the existing document management system, and adds the missing frontend page that lets authenticated users browse and download them.

On application startup, the backend discovers every file in the `docs/` folder (flat, non-recursive), classifies each file into a document category based on its filename, resolves its MIME type from its file extension, and registers it as a `Document` record with an access level that restricts it to registered (authenticated) users. Seeding is idempotent across restarts: unchanged files are not re-registered, and files whose content changed are re-synchronized in place rather than duplicated.

The feature also adds a new frontend Documents page at the `/documents` route, gated behind authentication, that groups documents by category, provides a text search filter, and lets each document be downloaded through the existing document API.

## Glossary

- **Document_System**: The existing backend document management subsystem comprising the `Document` model, the storage service, and the document API router mounted at `/api/documents`.
- **Seeding_Process**: The backend component that runs during application startup to register `docs/` folder files as `Document` records.
- **Docs_Folder**: The `docs/` directory located at the repository root, baked into the application container image.
- **Source_File**: A single file located directly inside the Docs_Folder (non-recursive).
- **Document_Record**: A row in the `documents` table represented by the `Document` model.
- **Stored_File**: The persisted copy of a Source_File written to the upload storage location.
- **Upload_Storage**: The persisted storage location identified by the `UPLOAD_DIR` setting (`./storage/uploads`), backed by a Docker named volume.
- **Max_Upload_Size**: The configured maximum file size for a single document, defined by the `MAX_UPLOAD_SIZE` setting (10 megabytes).
- **Seeding_Admin**: The user record used as the `uploaded_by` value for seeded Document_Records, resolved as the default administrator (`admin@opcp-psmc.com`) or, if absent, the first existing administrator user.
- **Document_Category**: The classification value from the existing `DocumentCategory` enumeration (`statutes`, `minutes`, `financial_reports`, `other`).
- **Access_Level**: The permission value from the existing `AccessLevel` enumeration (`public`, `members`, `administrators`).
- **Content_Hash**: A deterministic hash computed over the byte content of a Source_File, used together with file size to detect content changes.
- **Documents_Page**: The new frontend page rendered at the `/documents` route.
- **Document_Service**: The new frontend service module that calls the existing document API endpoints.
- **Registered_User**: An authenticated user who has logged in and holds a valid session.
- **Anonymous_User**: A request made without valid authentication.

## Requirements

### Requirement 1: Startup seeding trigger

**User Story:** As an administrator, I want documents in the repository `docs/` folder to be published automatically when the application starts, so that they are available without manual upload.

#### Acceptance Criteria

1. WHEN the application startup lifespan runs after the default administrator creation step completes, THE Seeding_Process SHALL execute once.
2. WHERE a Seeding_Admin can be resolved, THE Seeding_Process SHALL use the Seeding_Admin as the `uploaded_by` value for every Document_Record it creates.
3. IF no administrator user exists at startup, THEN THE Seeding_Process SHALL perform no document registration and SHALL log a warning that seeding was skipped due to a missing administrator.

### Requirement 2: File discovery

**User Story:** As an administrator, I want all files placed directly in the `docs/` folder to be considered for seeding, so that content is published consistently.

#### Acceptance Criteria

1. WHEN the Seeding_Process runs, THE Seeding_Process SHALL enumerate every Source_File located directly in the Docs_Folder without descending into subdirectories.
2. IF the Docs_Folder does not exist, THEN THE Seeding_Process SHALL perform no document registration and SHALL log a message that the Docs_Folder was not found.
3. IF a Source_File size exceeds the Max_Upload_Size, THEN THE Seeding_Process SHALL skip that Source_File and SHALL log that the file was skipped for exceeding the maximum size.

### Requirement 3: MIME type resolution

**User Story:** As an administrator, I want the document types in `docs/` to be recognized correctly, so that seeding is not blocked by upload validation.

#### Acceptance Criteria

1. WHEN the Seeding_Process registers a Source_File with a `.md` extension, THE Seeding_Process SHALL assign the MIME type `text/markdown`.
2. WHEN the Seeding_Process registers a Source_File with a `.txt` extension, THE Seeding_Process SHALL assign the MIME type `text/plain`.
3. WHEN the Seeding_Process registers a Source_File with a `.pdf` extension, THE Seeding_Process SHALL assign the MIME type `application/pdf`.
4. WHEN the Seeding_Process registers a Source_File with a `.doc` extension, THE Seeding_Process SHALL assign the MIME type `application/msword`.
5. THE Seeding_Process SHALL write each Stored_File and create each Document_Record directly through the Document_System storage layer without invoking the upload endpoint MIME validation.

### Requirement 4: Category inference

**User Story:** As a Registered_User, I want documents grouped by meaningful categories, so that I can find them easily.

#### Acceptance Criteria

1. WHEN a Source_File name contains the keyword indicating statutes, THE Seeding_Process SHALL assign the Document_Category `statutes`.
2. WHEN a Source_File name contains the keyword indicating minutes, THE Seeding_Process SHALL assign the Document_Category `minutes`.
3. WHEN a Source_File name contains a keyword indicating financial content or a report, THE Seeding_Process SHALL assign the Document_Category `financial_reports`.
4. IF a Source_File name matches no defined category keyword, THEN THE Seeding_Process SHALL assign the Document_Category `other`.

### Requirement 5: Access level assignment

**User Story:** As an administrator, I want seeded documents to be available only to registered users, so that anonymous visitors cannot access them.

#### Acceptance Criteria

1. WHEN the Seeding_Process creates a Document_Record, THE Seeding_Process SHALL assign the Access_Level `members`.
2. WHEN a Registered_User requests the document list, THE Document_System SHALL include seeded documents that have the Access_Level `members`.
3. IF an Anonymous_User requests a seeded document, THEN THE Document_System SHALL deny access.

### Requirement 6: Idempotent seeding and content-change re-sync

**User Story:** As an administrator, I want restarts to avoid duplicate documents while still reflecting updated files, so that the document list stays accurate.

#### Acceptance Criteria

1. WHEN the Seeding_Process processes a Source_File whose original filename already has a corresponding Document_Record, THE Seeding_Process SHALL reuse the existing Document_Record identifier instead of creating a new Document_Record.
2. WHEN the Seeding_Process processes a Source_File whose original filename has no corresponding Document_Record, THE Seeding_Process SHALL create one Document_Record and write one Stored_File.
3. WHILE a Source_File content is unchanged since its last seeding as determined by matching file size and Content_Hash, THE Seeding_Process SHALL leave the existing Document_Record and Stored_File unmodified.
4. WHEN a Source_File file size or Content_Hash differs from the value recorded at its last seeding, THE Seeding_Process SHALL replace the Stored_File and update the existing Document_Record identified by the same identifier.
5. THE Seeding_Process SHALL create no more than one Document_Record and no more than one Stored_File per distinct Source_File original filename across repeated application startups.

### Requirement 7: Documents page access control

**User Story:** As a Registered_User, I want a dedicated Documents page that only I can reach, so that document access follows the same authentication rules.

#### Acceptance Criteria

1. WHEN a Registered_User navigates to the `/documents` route, THE Documents_Page SHALL render.
2. IF an Anonymous_User navigates to the `/documents` route, THEN THE Document_System SHALL redirect the request to the login flow through the protected route wrapper.
3. WHEN the Documents_Page loads, THE Document_Service SHALL retrieve the document list from the existing endpoint `GET /api/documents`.

### Requirement 8: Documents page display and grouping

**User Story:** As a Registered_User, I want documents organized by category with their names and sizes, so that I can scan and locate them.

#### Acceptance Criteria

1. WHEN the Documents_Page displays retrieved documents, THE Documents_Page SHALL group documents into sections by Document_Category using the French labels "Statuts" for `statutes`, "Comptes rendus" for `minutes`, "Rapports financiers" for `financial_reports`, and "Autre" for `other`.
2. WHEN the Documents_Page displays a document item, THE Documents_Page SHALL show the document name and the document size.
3. WHEN the Documents_Page displays a document item, THE Documents_Page SHALL present a download control for that document.
4. THE Documents_Page SHALL render its interface text in French and apply the theme color `#000E9C` using Tailwind styling.

### Requirement 9: Documents page search filter

**User Story:** As a Registered_User, I want to filter documents by text, so that I can narrow a long list quickly.

#### Acceptance Criteria

1. WHEN a Registered_User enters text in the Documents_Page search field, THE Documents_Page SHALL display only documents whose name contains the entered text.
2. WHEN the Documents_Page search field is empty, THE Documents_Page SHALL display all retrieved documents.

### Requirement 10: Document download

**User Story:** As a Registered_User, I want to download a document from the Documents page, so that I can obtain its file.

#### Acceptance Criteria

1. WHEN a Registered_User activates the download control for a document, THE Document_Service SHALL request the file from the existing endpoint `GET /api/documents/{id}/download`.
2. WHEN the Document_System serves a download request for an accessible document, THE Document_System SHALL increment the `download_count` of that Document_Record and record an audit log entry.
3. IF the Document_System denies a download request, THEN THE Documents_Page SHALL inform the Registered_User that the document could not be downloaded.

# Requirements Document

## Introduction

This feature adds an administrator-only document upload capability to the Documents interface and replaces the existing fixed document category enum (`statutes`, `minutes`, `financial_reports`, `other`) with three categories (`documents`, `scripts`, `links`). The category of each uploaded item is derived automatically from the uploaded file's extension rather than chosen by the uploader. Existing stored documents are remapped to the `documents` category through an Alembic migration. Uploaded items appear in the existing grouped, downloadable document list. Category display names remain configurable through i18n translation keys, while assignment itself is automatic.

## Glossary

- **Documents_Interface**: The frontend `DocumentsPage.tsx` React component that renders the grouped, read-only document list.
- **Document_Service**: The frontend `documentService.ts` module that calls the documents backend endpoints.
- **Auth_Service**: The frontend `authService` module exposing `isAdmin()`.
- **Admin_User**: An authenticated user for whom `Auth_Service.isAdmin()` returns true, and who on the backend passes the `get_administrator` dependency.
- **Non_Admin_User**: An authenticated user for whom `Auth_Service.isAdmin()` returns false.
- **Documents_API**: The existing backend documents router exposing `POST /api/documents/upload`, `GET /api/documents`, `GET /api/documents/{id}/download`, and `DELETE /api/documents/{id}`.
- **Storage_Service**: The backend `storage_service.py` module that validates file types and persists uploaded files to the storage path.
- **Document_Category**: One of the three values `documents`, `scripts`, or `links` assigned to each stored document.
- **Category_Mapping**: The fixed mapping from a file extension to a Document_Category.
- **Category_Migration**: The Alembic migration that converts the existing document category enum to the new set and remaps existing rows.
- **Upload_Control**: The upload user-interface element rendered in the Documents_Interface.
- **Grouped_List**: The document list in the Documents_Interface, grouped and ordered by category using `CATEGORY_ORDER` and labeled via `CATEGORY_LABEL_KEYS`.

## Requirements

### Requirement 1: Document category set

**User Story:** As a platform maintainer, I want documents classified under `documents`, `scripts`, or `links`, so that content is organized by type rather than by the previous fixed enum.

#### Acceptance Criteria

1. THE Document_Category SHALL be one of the values `documents`, `scripts`, or `links`.
2. THE Documents_Interface SHALL group and order the Grouped_List by the categories `documents`, `scripts`, and `links`.
3. THE Documents_Interface SHALL resolve each category display name from an i18n translation key defined for both French and English.

### Requirement 2: Extension-based category assignment

**User Story:** As an Admin_User, I want the category assigned automatically from the file extension, so that I do not have to choose a category manually.

#### Acceptance Criteria

1. WHEN a file with extension `pdf`, `doc`, `docx`, `md`, or `txt` is uploaded, THE Documents_API SHALL assign the Document_Category `documents`.
2. WHEN a file with extension `sh`, `sql`, or `py` is uploaded, THE Documents_API SHALL assign the Document_Category `scripts`.
3. WHEN a file is uploaded under the `links` category, THE Documents_API SHALL store the file at the same storage path as other categories and assign the Document_Category `links`.
4. IF a file has an extension that is not present in the Category_Mapping, THEN THE Documents_API SHALL reject the upload and return an error response.

### Requirement 3: Admin-only upload capability

**User Story:** As an Admin_User, I want an upload control available to me, so that I can add documents that other users can later download.

#### Acceptance Criteria

1. WHERE `Auth_Service.isAdmin()` returns true, THE Documents_Interface SHALL display the Upload_Control.
2. WHERE `Auth_Service.isAdmin()` returns false, THE Documents_Interface SHALL hide the Upload_Control.
3. WHEN an Admin_User submits a file through the Upload_Control, THE Document_Service SHALL send the file to `POST /api/documents/upload`.
4. WHEN a request reaches `POST /api/documents/upload`, THE Documents_API SHALL authorize the request using the `get_administrator` dependency.
5. IF a Non_Admin_User sends a request to `POST /api/documents/upload`, THEN THE Documents_API SHALL reject the request with an authorization error response.

### Requirement 4: Backend file type acceptance

**User Story:** As a platform maintainer, I want the storage layer to accept the new file types, so that scripts and text documents can be uploaded successfully.

#### Acceptance Criteria

1. WHEN a file with extension `md`, `txt`, `sh`, `sql`, or `py` is uploaded, THE Storage_Service SHALL accept the file as a valid type.
2. WHEN a file is accepted, THE Storage_Service SHALL persist the file to the existing storage path.
3. IF an uploaded file's type is not in the allowed set, THEN THE Storage_Service SHALL reject the file and return an error response.

### Requirement 5: Upload result visibility and download

**User Story:** As a user with access, I want uploaded items to appear in the document list, so that I can download them.

#### Acceptance Criteria

1. WHEN an upload completes successfully, THE Documents_Interface SHALL display the uploaded item within its assigned category in the Grouped_List.
2. WHEN a user selects a listed item for download, THE Document_Service SHALL request `GET /api/documents/{id}/download`.
3. THE Documents_API SHALL apply the existing role-based filtering when responding to `GET /api/documents`.

### Requirement 6: Migration of existing documents

**User Story:** As a platform maintainer, I want existing documents preserved under the new category set, so that no stored content is lost during the change.

#### Acceptance Criteria

1. WHEN the Category_Migration runs, THE Category_Migration SHALL convert the document category enum to the values `documents`, `scripts`, and `links`.
2. WHEN the Category_Migration runs, THE Category_Migration SHALL remap every existing document row to the Document_Category `documents`.
3. WHEN the Category_Migration completes, THE Documents_API SHALL return each previously stored document with the Document_Category `documents`.

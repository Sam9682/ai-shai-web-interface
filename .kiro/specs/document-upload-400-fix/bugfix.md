# Bugfix Requirements Document

## Introduction

Uploading a file from the Documents page (`/documents`) fails with an HTTP 400 Bad Request. The UI shows "Failed to upload the document." and no document is created.

The upload flow is: `DocumentsPage` → `documentService.uploadDocument(file)` → `api.post('/documents/upload', form)` where `form` is a `FormData` object containing the `file` and `access_level` fields.

The shared axios client (`frontend/src/services/api.ts`) is created with a hard-coded default request header `Content-Type: application/json`. This default is applied to every request, including the multipart `FormData` upload. Because the header is pinned to `application/json`, the browser/axios does not replace it with the required `multipart/form-data; boundary=...` value. The backend endpoint `POST /api/documents/upload` (FastAPI, `app/documents/router.py`) declares `file: UploadFile = File(...)` and `access_level: AccessLevel = Form(...)`, so it cannot parse the body when the content type is `application/json` and the multipart boundary is missing. FastAPI therefore rejects the request before the handler runs, returning a small JSON error body (consistent with the observed `Content-Type: application/json`, 336-byte response).

The fix is to ensure the `FormData` upload is sent without forcing the JSON content type, so the browser sets the correct `multipart/form-data` content type (including the boundary) and the backend can parse the `file` and `access_level` fields.

## Bug Analysis

### Current Behavior (Defect)

When a user uploads a document, the request is sent with `Content-Type: application/json` even though the body is `FormData`, so the multipart body is unparseable by the backend.

1.1 WHEN an admin user submits a file through the Documents page upload control THEN the system sends the `POST /api/documents/upload` request with `Content-Type: application/json` instead of `multipart/form-data`
1.2 WHEN the `POST /api/documents/upload` request is sent with `FormData` under a forced `application/json` content type THEN the system responds with HTTP 400 Bad Request and creates no document
1.3 WHEN the upload request fails THEN the Documents page displays "Failed to upload the document." and no new document appears in the list

### Expected Behavior (Correct)

The upload request must carry a `multipart/form-data` content type with a boundary so the backend can parse the `file` and `access_level` fields.

2.1 WHEN an admin user submits a file through the Documents page upload control THEN the system SHALL send the `POST /api/documents/upload` request with a `multipart/form-data` content type that includes the multipart boundary
2.2 WHEN the `POST /api/documents/upload` request carries a valid `FormData` body with `file` and `access_level` THEN the system SHALL accept the request, store the document, and respond with HTTP 201 Created
2.3 WHEN the upload succeeds THEN the Documents page SHALL clear the error state and refresh the list so the uploaded document appears

### Unchanged Behavior (Regression Prevention)

Only the multipart upload path is affected; all other API calls that legitimately send JSON must continue to work unchanged.

3.1 WHEN the client sends a JSON request body (e.g. login, forum, or other `POST`/`PUT` calls) THEN the system SHALL CONTINUE TO send `Content-Type: application/json`
3.2 WHEN a request is made through the shared axios client THEN the system SHALL CONTINUE TO attach the `Authorization: Bearer <token>` header when an access token is present
3.3 WHEN a protected request returns HTTP 401 on a non-auth endpoint THEN the system SHALL CONTINUE TO clear the stored token and redirect to `/login`
3.4 WHEN a non-admin user attempts to upload a document THEN the system SHALL CONTINUE TO reject the request with an authorization error and create no document
3.5 WHEN an admin uploads a file with an unsupported extension THEN the system SHALL CONTINUE TO reject the request with a 400 "unsupported category" error and create no document

## Bug Condition and Properties

### Bug Condition

```pascal
FUNCTION isBugCondition(X)
  INPUT: X of type OutgoingRequest
  OUTPUT: boolean

  // The request body is FormData (a multipart upload) but the client
  // forces the JSON content type, dropping the multipart boundary.
  RETURN isFormData(X.body) AND X.headers["Content-Type"] = "application/json"
END FUNCTION
```

### Fix Checking

```pascal
// Property: Fix Checking - FormData uploads use multipart content type
FOR ALL X WHERE isBugCondition(X) DO
  result ← sendRequest'(X)
  ASSERT contentTypeOf(result.request) STARTS_WITH "multipart/form-data"
      AND result.request.headers["Content-Type"] != "application/json"
END FOR
```

### Preservation Checking

```pascal
// Property: Preservation Checking - non-FormData requests are unchanged
FOR ALL X WHERE NOT isBugCondition(X) DO
  ASSERT sendRequest(X) = sendRequest'(X)
END FOR
```

- **F**: the current axios client that pins `Content-Type: application/json` on every request, including `FormData` uploads.
- **F'**: the fixed client that lets `FormData` requests use the browser-generated `multipart/form-data` content type while leaving JSON requests untouched.

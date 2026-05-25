# Announcement Endpoint Documentation

## Overview

The announcement endpoint allows administrators to send announcements to all active members of the HYPERVISIA association.

## Endpoint

**POST** `/api/admin/announcements`

## Authentication

Requires administrator role. The endpoint uses JWT token authentication and the `require_admin` dependency to ensure only administrators can send announcements.

## Request Body

```json
{
  "subject": "string (required, min_length=1, max_length=255)",
  "content": "string (required, min_length=1)",
  "sender_name": "string (optional, default='HYPERVISIA')"
}
```

### Fields

- **subject**: The subject line of the announcement (required)
- **content**: The main content of the announcement (required)
- **sender_name**: The name of the sender to display in the email (optional, defaults to "HYPERVISIA")

## Response

**Success (200 OK)**

```json
{
  "success": true,
  "message": "Announcement sent successfully to X members",
  "notifications_sent": 4,
  "total_members": 5
}
```

### Response Fields

- **success**: Boolean indicating if the operation was successful
- **message**: Human-readable message about the operation
- **notifications_sent**: Number of notifications successfully sent
- **total_members**: Total number of active members (verified email)

## Behavior

1. **Target Audience**: Sends to all users with:
   - Role: MEMBER or ADMINISTRATOR
   - Email verified: true
   - Announcement notifications enabled: true (in preferences)

2. **Notification Preferences**: Respects user notification preferences. Users who have disabled announcement notifications will not receive the email.

3. **Email Format**: Sends both HTML and plain text versions of the email with:
   - Professional HTML template with HYPERVISIA branding
   - Subject line prefixed with "[HYPERVISIA]"
   - Personalized greeting with user's first name
   - Announcement subject and content
   - Footer with association information

4. **Audit Logging**: Creates an audit log entry with:
   - Admin ID who sent the announcement
   - Action: "send_announcement"
   - Subject and content preview
   - Number of notifications sent
   - Total active members

5. **Rate Limiting**: Limited to 10 announcements per hour per administrator to prevent spam.

## Error Responses

### 403 Forbidden

```json
{
  "error": {
    "code": "INSUFFICIENT_PERMISSIONS",
    "message": "Administrator role required for this operation",
    "details": {
      "required_role": "administrator",
      "user_role": "member"
    }
  }
}
```

Returned when a non-administrator attempts to send an announcement.

### 400 Bad Request

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation error",
    "details": {
      "field": "subject",
      "reason": "String should have at least 1 character"
    }
  }
}
```

Returned when request validation fails (empty subject, empty content, etc.).

## Example Usage

### cURL

```bash
# Login as administrator
TOKEN=$(curl -X POST http://ai-hypervisia:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@hypervisia.fr","password":"Admin1234!"}' \
  | jq -r '.access_token')

# Send announcement
curl -X POST http://ai-hypervisia:8000/api/admin/announcements \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "subject": "Assemblée Générale 2024",
    "content": "Chers membres, nous vous invitons à notre assemblée générale annuelle qui se tiendra le 15 mars 2024 à 18h00.",
    "sender_name": "Le Président"
  }'
```

### Python

```python
import requests

# Login
response = requests.post(
    "http://ai-hypervisia:8000/api/auth/login",
    json={"email": "admin@hypervisia.fr", "password": "Admin1234!"}
)
token = response.json()["access_token"]

# Send announcement
response = requests.post(
    "http://ai-hypervisia:8000/api/admin/announcements",
    headers={"Authorization": f"Bearer {token}"},
    json={
        "subject": "Assemblée Générale 2024",
        "content": "Chers membres, nous vous invitons à notre assemblée générale annuelle qui se tiendra le 15 mars 2024 à 18h00.",
        "sender_name": "Le Président"
    }
)

result = response.json()
print(f"Sent to {result['notifications_sent']} members")
```

### JavaScript (fetch)

```javascript
// Login
const loginResponse = await fetch('http://ai-hypervisia:8000/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    email: 'admin@hypervisia.fr',
    password: 'Admin1234!'
  })
});
const { access_token } = await loginResponse.json();

// Send announcement
const response = await fetch('http://ai-hypervisia:8000/api/admin/announcements', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${access_token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    subject: 'Assemblée Générale 2024',
    content: 'Chers membres, nous vous invitons à notre assemblée générale annuelle qui se tiendra le 15 mars 2024 à 18h00.',
    sender_name: 'Le Président'
  })
});

const result = await response.json();
console.log(`Sent to ${result.notifications_sent} members`);
```

## Requirements Validation

This endpoint validates **Requirement 10.5**:

> WHEN an administrator sends an announcement, THE System SHALL deliver it to all active members by email

The implementation:
- ✅ Restricts access to administrators only
- ✅ Sends to all active members (verified email, MEMBER or ADMINISTRATOR role)
- ✅ Respects user notification preferences
- ✅ Delivers via email with both HTML and plain text formats
- ✅ Logs the action in the audit log
- ✅ Returns count of successful deliveries

## Testing

Comprehensive test suite in `tests/test_announcement_endpoint.py` covers:

1. ✅ Successful announcement sending to all active members
2. ✅ Respecting user notification preferences
3. ✅ Authorization checks (admin-only access)
4. ✅ Authentication checks (unauthenticated users denied)
5. ✅ Input validation (empty subject, empty content, missing fields)
6. ✅ Only sending to verified members
7. ✅ Custom sender name support
8. ✅ Default sender name behavior

All tests pass successfully.

## Related Components

- **NotificationService** (`app/services/notification_service.py`): Handles the actual sending of announcements
- **EmailService** (`app/services/email_service.py`): Sends emails via SMTP
- **Admin Router** (`app/admin/router.py`): Defines the API endpoint
- **Admin Schemas** (`app/admin/schemas.py`): Request/response validation
- **Audit Log** (`app/models.py`): Records administrative actions

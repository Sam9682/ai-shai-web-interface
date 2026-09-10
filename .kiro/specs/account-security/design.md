# Design Document

## Overview

This feature adds account security management spanning the React/TypeScript frontend and the FastAPI backend. Authenticated users reach a protected page at `/account/security` from a header icon (and a labeled mobile-menu entry). From that page they can:

- Change their password (verified against the current password).
- Trigger a password-reset email to their own registered address, reusing the existing `Password_Reset_Flow`.
- Enable/disable TOTP-based two-factor authentication (2FA) using `pyotp`, with a QR/secret provisioning + confirmation step.
- Enable/disable email-based 2FA.
- View their current 2FA status.

When either 2FA method is enabled, the login flow requires a second verification step before a session token is issued.

The design reuses the existing building blocks: `authService.ts`/`api.ts` on the frontend; `app/auth/router.py`, `password.py` (`hash_password`/`verify_password`), `token.py`, `dependencies.py` (`get_current_user`), the `email_service`, `AuditLog`, and the `User` model on the backend. `pyotp` is added to `requirements.txt`, and new `User` columns are provisioned via an Alembic migration.

### Design Goals

- Reuse existing patterns (rate limiting via `slowapi`, `ErrorResponse.create`, audit logging, JWT tokens, `ProtectedRoute`) rather than introducing new mechanisms.
- Keep the login response backward compatible for users without 2FA (Requirement 7.4).
- Store TOTP secrets and derive verification results server-side only; never trust client-supplied enabled state.

## Architecture

```
Frontend (React + Vite + Tailwind + React Router)
┌──────────────────────────────────────────────────────────────┐
│ Layout.tsx                                                     │
│   └─ Header_Security_Link (desktop icon + mobile entry)  ──►   │
│ App.tsx                                                        │
│   └─ Route /account/security → ProtectedRoute → SecurityPage   │
│ pages/SecurityPage.tsx                                         │
│   ├─ PasswordSection (change + reset-by-email)                 │
│   └─ TwoFactorSection (status, TOTP setup, email 2FA toggle)   │
│ services/securityService.ts  ── uses ──►  services/api.ts      │
│ services/authService.ts (login extended for 2FA step)         │
└───────────────────────────┬────────────────────────────────────┘
                            │  HTTPS  (Authorization: Bearer <jwt>)
                            ▼
Backend (FastAPI)
┌──────────────────────────────────────────────────────────────┐
│ app/auth/router.py  (prefix /api/auth)                         │
│   ├─ POST /change-password        (get_current_user)           │
│   ├─ GET  /2fa/status             (get_current_user)           │
│   ├─ POST /2fa/totp/setup         (get_current_user)           │
│   ├─ POST /2fa/totp/confirm       (get_current_user)           │
│   ├─ POST /2fa/totp/disable       (get_current_user)           │
│   ├─ POST /2fa/email/enable       (get_current_user)           │
│   ├─ POST /2fa/email/disable      (get_current_user)           │
│   ├─ POST /login          (extended: returns challenge if 2FA) │
│   └─ POST /login/2fa      (verifies second step → issues token)│
│ app/auth/totp.py   (new: pyotp helpers)                        │
│ app/auth/password.py (reused: hash_password/verify_password)   │
│ app/auth/token.py  (reused: JWT for session + 2fa challenge)   │
│ app/services/email.py (reused + new send_2fa_code_email)       │
│ app/models/user.py (new columns) ── AuditLog                   │
│ migrations/versions/<rev>_add_2fa_fields.py                    │
└──────────────────────────────────────────────────────────────┘
```

### Login flow with 2FA (two-step)

The primary `/login` step keeps validating email/password, email-verification, and rate limits exactly as today. The change is what happens **after** primary credentials are validated:

- If the user has no 2FA enabled → issue the session token immediately (unchanged behavior, Requirement 7.4).
- If TOTP and/or Email 2FA is enabled → do **not** issue a session token. Instead return a short-lived **2FA challenge token** (a JWT with `type: "2fa_challenge"`, `sub: user_id`, ~5 min expiry) plus which methods are required. For Email 2FA, a numeric code is generated, emailed, and its hash is embedded in the challenge token so no server-side state store is required.

The client then calls `/login/2fa` with the challenge token and the submitted code. The backend validates the code and, only on success, issues the real session token.

```
Client                         /login                         /login/2fa
  │  email+password  ─────────────►│
  │                                │ verify creds, email-verified, rate limit
  │                                │
  │        no 2FA ◄── session token (200, access_token)     [Req 7.4]
  │                                │
  │  2FA enabled ◄── 200 { requires_2fa: true,              [Req 7.1,7.2]
  │                        methods: ["totp"|"email"],
  │                        challenge_token }
  │   (email method: code emailed) │
  │                                │
  │  challenge_token + code ───────┼──────────────────────────►│
  │                                │        verify code vs secret/challenge
  │        valid ◄── session token (200, access_token)       [Req 7.1,7.2]
  │        invalid ◄── 401 verification error (no token)     [Req 7.3]
```

Design note on the email code: the challenge token carries `code_hash` (a hash of the emailed code) and `exp`. `/login/2fa` recomputes the hash of the submitted code and compares. This keeps the second step stateless and consistent with the existing token-based patterns (email verification, password reset). TOTP does not need a code in the token — it is validated directly against the user's stored `totp_secret`.

## Components and Interfaces

### Backend

#### `app/auth/totp.py` (new)

Thin wrapper over `pyotp` so the router and tests share one implementation.

```python
import pyotp

ISSUER = "OPCP"

def generate_secret() -> str:
    """Return a new base32 TOTP secret."""
    return pyotp.random_base32()

def provisioning_uri(secret: str, account_email: str) -> str:
    """otpauth:// URI for QR rendering."""
    return pyotp.TOTP(secret).provisioning_uri(name=account_email, issuer_name=ISSUER)

def verify_code(secret: str, code: str, valid_window: int = 1) -> bool:
    """Validate a submitted TOTP code (±1 step tolerance for clock drift)."""
    if not secret or not code:
        return False
    return pyotp.TOTP(secret).verify(code.strip(), valid_window=valid_window)
```

#### Router endpoints (`app/auth/router.py`)

All 2FA/password endpoints below depend on `get_current_user` and operate on `Current_User`. They reuse `ErrorResponse.create` for errors, write `AuditLog` rows for security events, and use `@limiter.limit(...)` where abuse is possible.

**`POST /api/auth/change-password`** — Requirements 3.2–3.7
- Request: `{ "current_password": str, "new_password": str }`
- Behavior: `verify_password(current_password, user.password_hash)`; if false → `401 INVALID_CREDENTIALS`, no change. If true → `user.password_hash = hash_password(new_password)`, write `AuditLog(action="PASSWORD_CHANGED")`, commit.
- Response: `200 { "message": "Mot de passe modifié avec succès." }`
- Rate limit: `@limiter.limit("10/hour")`.

**`GET /api/auth/2fa/status`** — Requirement 8.1, 8.2
- Response: `200 { "totp_enabled": bool, "email_2fa_enabled": bool }`

**`POST /api/auth/2fa/totp/setup`** — Requirement 5.1
- Behavior: generate a secret, store it as a **pending** secret on the user (`totp_secret` set, `totp_enabled` still false). Return provisioning URI + secret.
- Response: `200 { "secret": str, "otpauth_uri": str }`
- Rate limit: `@limiter.limit("10/hour")`.

**`POST /api/auth/2fa/totp/confirm`** — Requirements 5.3–5.5
- Request: `{ "code": str }`
- Behavior: `totp.verify_code(user.totp_secret, code)`; if false → `400 INVALID_2FA_CODE`, leave `totp_enabled=false`. If true → `totp_enabled=true`, `AuditLog(action="TOTP_2FA_ENABLED")`, commit.
- Response: `200 { "totp_enabled": true }`

**`POST /api/auth/2fa/totp/disable`** — supports Requirement 8 (management)
- Behavior: `totp_enabled=false`, `totp_secret=None`, `AuditLog(action="TOTP_2FA_DISABLED")`.
- Response: `200 { "totp_enabled": false }`

**`POST /api/auth/2fa/email/enable`** — Requirement 6.1
- Behavior: `email_2fa_enabled=true`, `AuditLog(action="EMAIL_2FA_ENABLED")`.
- Response: `200 { "email_2fa_enabled": true }`

**`POST /api/auth/2fa/email/disable`** — management
- Behavior: `email_2fa_enabled=false`, `AuditLog(action="EMAIL_2FA_DISABLED")`.
- Response: `200 { "email_2fa_enabled": false }`

**`POST /api/auth/login`** (extended) — Requirements 7.1, 7.2, 7.4
- After primary validation succeeds:
  - No 2FA → unchanged `LoginResponse` with `access_token`.
  - 2FA enabled → `200 { "requires_2fa": true, "methods": [...], "challenge_token": str }`. For email method, generate a 6-digit code, email it via `email_service.send_2fa_code_email`, and embed its hash in the challenge token.

**`POST /api/auth/login/2fa`** (new) — Requirements 7.1, 7.2, 7.3
- Request: `{ "challenge_token": str, "code": str }`
- Behavior: verify challenge token (`type == "2fa_challenge"`, not expired). Resolve user. Validate the code:
  - TOTP method → `totp.verify_code(user.totp_secret, code)`.
  - Email method → `hash(code) == payload["code_hash"]`.
  - If invalid → `401 INVALID_2FA_CODE`, no token, `AuditLog(action="LOGIN_2FA_FAILED")`.
  - If valid → issue the normal session token, `AuditLog(action="LOGIN_SUCCESS")`.
- Rate limit: `@limiter.limit("20/hour")`.

#### Schemas (`app/auth/schemas.py`, new)

```python
class ChangePasswordRequest(BaseModel):
    current_password: str = Field(min_length=1)
    new_password: str = Field(min_length=8, max_length=72)
    # reuse the same complexity validator as PasswordResetConfirm

class TwoFactorStatusResponse(BaseModel):
    totp_enabled: bool
    email_2fa_enabled: bool

class TotpSetupResponse(BaseModel):
    secret: str
    otpauth_uri: str

class TotpConfirmRequest(BaseModel):
    code: str = Field(min_length=1, max_length=10)

class Login2FARequest(BaseModel):
    challenge_token: str = Field(min_length=1)
    code: str = Field(min_length=1, max_length=10)

class Login2FAChallengeResponse(BaseModel):
    requires_2fa: bool = True
    methods: list[str]
    challenge_token: str
```

The existing `LoginResponse` is unchanged; login returns either `LoginResponse` or `Login2FAChallengeResponse` depending on 2FA state.

#### Email service (`app/services/email.py`, extended)

Add `send_2fa_code_email(to_email, code, user_name) -> bool`, mirroring the existing French-language reset email, reusing `send_email`. Reset-by-email (Requirement 4) reuses the existing `send_password_reset_email` via the existing `/api/auth/password-reset` endpoint — no new backend endpoint is required for that requirement.

### Frontend

#### `services/securityService.ts` (new)

```typescript
export interface TwoFactorStatus { totp_enabled: boolean; email_2fa_enabled: boolean; }
export interface TotpSetup { secret: string; otpauth_uri: string; }

export const securityService = {
  changePassword(currentPassword: string, newPassword: string): Promise<void>,   // POST /auth/change-password
  getTwoFactorStatus(): Promise<TwoFactorStatus>,                                 // GET  /auth/2fa/status
  startTotpSetup(): Promise<TotpSetup>,                                           // POST /auth/2fa/totp/setup
  confirmTotp(code: string): Promise<void>,                                       // POST /auth/2fa/totp/confirm
  disableTotp(): Promise<void>,                                                   // POST /auth/2fa/totp/disable
  enableEmail2fa(): Promise<void>,                                                // POST /auth/2fa/email/enable
  disableEmail2fa(): Promise<void>,                                               // POST /auth/2fa/email/disable
};
```

All calls go through the existing `api` client, which already injects `Authorization: Bearer <token>` and handles `401` globally (Requirement 3.2 authenticated request).

#### `authService.ts` (extended) — Requirement 7

`login()` now branches on the response:
- If `requires_2fa` → return the challenge (methods + `challenge_token`) to the caller without storing a token.
- Add `verifyLogin2fa(challengeToken, code)` → `POST /auth/login/2fa`; on success stores `access_token`/`user` exactly as today.

The `LoginPage` renders a second-step code input when `requires_2fa` is returned. (LoginPage edits are minimal and out of the security page's scope but required for enforcement.)

#### `pages/SecurityPage.tsx` (new) — Requirements 2, 3, 4, 5, 8

French UI with two sections:

- **Password section**: current-password + new-password inputs and a submit button (Requirements 3.1, 3.2); a "Réinitialiser par Email" button that calls `authService.requestPasswordReset(currentUser.email)` (Requirements 4.1, 4.2). French success/error banners for both (Requirements 3.7, 4.4).
- **Two-factor section**: on mount calls `getTwoFactorStatus()` (Requirement 8.1) and shows French active/inactive labels for TOTP and Email 2FA (Requirement 8.2), or a French error banner on failure (Requirement 8.3). TOTP flow shows a QR (rendered from `otpauth_uri`) and the secret while pending (Requirement 5.2) and a code-confirm input; email 2FA is a toggle.

The current user's email is read from `localStorage` (`user`), already populated by `authService.login`.

#### `App.tsx` (extended) — Requirements 2.1, 2.2

Add inside the `Layout`-wrapped routes:

```tsx
<Route path="/account/security" element={
  <ProtectedRoute><SecurityPage /></ProtectedRoute>
} />
```

`ProtectedRoute` already redirects unauthenticated users to `/login` (Requirement 2.2).

#### `Layout.tsx` (extended) — Requirement 1

- Desktop: an icon-only `Link to="/account/security"` next to the "Déconnexion" button, using the same `bg-white/15 border border-white/30 text-white` styling (Requirements 1.1, 1.3, 1.4). Includes `aria-label="Sécurité du compte"` for accessibility since it is icon-only.
- Mobile menu: a labeled `Link` entry "Sécurité du compte" in the authenticated block (Requirement 1.2), closing the menu on click like the other entries.

## Data Models

### `User` model changes (`app/models/user.py`) — Requirements 5.6, 6.2

Add three columns:

```python
totp_secret: Mapped[str | None] = mapped_column(String(64), nullable=True, default=None)
totp_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false", default=False)
email_2fa_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false", default=False)
```

Pending-secret handling: `totp_secret` is set at `setup` time but `totp_enabled` stays `false` until a valid confirmation code arrives. This lets the same column serve both the pending and confirmed states without a separate table. On `disable`, `totp_secret` is cleared and `totp_enabled` set to `false`. There is no persisted email-2FA code — the login email code lives only in the emailed message and (as a hash) in the short-lived challenge token.

### 2FA challenge token (transient, not persisted)

A JWT created with the existing `create_access_token`, short expiry (~5 minutes):

```json
{ "sub": "<user_id>", "type": "2fa_challenge", "methods": ["email"], "code_hash": "<hash>", "exp": ... }
```

`code_hash` is present only for the email method.

### Migration plan (`migrations/versions/<rev>_add_account_security_2fa_fields.py`)

- `upgrade()`: `op.add_column('users', ...)` for `totp_secret` (nullable String(64)), `totp_enabled` (Boolean, `server_default='false'`, not null), `email_2fa_enabled` (Boolean, `server_default='false'`, not null).
- `downgrade()`: `op.drop_column('users', ...)` for the three columns.
- Boolean columns use `server_default='false'` so existing rows backfill safely, then the default can remain for new inserts. Generate the revision to chain from the current head, review the autogenerated diff, and run `alembic upgrade head`.

## Error Handling

| Condition | Endpoint | Response |
|---|---|---|
| Wrong current password | change-password | `401 INVALID_CREDENTIALS`, credential unchanged (Req 3.5) |
| New password fails complexity | change-password | `422`/`400` validation error (reuse validator) |
| Invalid TOTP confirm code | totp/confirm | `400 INVALID_2FA_CODE`, `totp_enabled` stays false (Req 5.5) |
| Invalid second-step code | login/2fa | `401 INVALID_2FA_CODE`, no token (Req 7.3) |
| Expired/invalid challenge token | login/2fa | `401 INVALID_TOKEN`, no token |
| Status load fails | frontend | French error banner "Impossible de charger le statut 2FA." (Req 8.3) |
| Unauthenticated `/account/security` | frontend | Redirect to `/login` (Req 2.2) |

All backend errors use `ErrorResponse.create(code, message, details)`. Frontend maps failures to French banners. The reset-by-email response stays generic (existing anti-enumeration message) but the page shows a French confirmation regardless (Req 4.4).

## Security Considerations

- **Secret storage**: `totp_secret` is stored server-side and returned to the client only once during setup (over HTTPS) so the user can register it. It is never returned by `/2fa/status`. On disable it is cleared.
- **Enforcement is server-side**: the client never asserts "2FA passed"; the session token is issued only by `/login` (no-2FA path) or `/login/2fa` (verified path). The challenge token cannot be exchanged for a session token without a valid code.
- **Timing / brute force**: `verify_password` (bcrypt) is constant-time by design. TOTP uses `pyotp.verify` with a small `valid_window` (±1) to tolerate clock drift without widening the guess space excessively. Email codes are 6 digits with ~5-minute validity via the challenge token expiry. `change-password`, `totp/setup`, and `login/2fa` carry `slowapi` rate limits consistent with existing endpoints to blunt online guessing.
- **No credential change on failure**: change-password and TOTP-confirm must not mutate persisted state on the failure path (Properties 1 and 2).
- **Audit trail**: password change, TOTP enable/disable, email-2FA enable/disable, and 2FA login failures are recorded in `AuditLog`, extending the existing security logging.
- **Anti-enumeration**: reset-by-email reuses the existing endpoint that returns a generic message regardless of account existence.
- **pyotp dependency**: add `pyotp==2.9.0` under the "Authentication & Security" section of `requirements.txt`. Frontend QR rendering can use the `otpauth_uri` with a lightweight QR library or an inline SVG generator; the secret is also shown as text for manual entry.

## Requirements Traceability

| Requirement | Design element |
|---|---|
| 1.1–1.4 | `Layout.tsx` desktop icon + mobile entry, styling, route target |
| 2.1–2.4 | `App.tsx` route + `ProtectedRoute`; `SecurityPage.tsx` French, two sections |
| 3.1–3.7 | `change-password` endpoint + `PasswordSection`; audit; French banners |
| 4.1–4.4 | Reuse `requestPasswordReset` + existing `/password-reset`; French confirmation |
| 5.1–5.6 | `totp.py`, `totp/setup`/`totp/confirm` endpoints; `User.totp_secret`/`totp_enabled`; migration |
| 6.1–6.2 | `2fa/email/enable`; `User.email_2fa_enabled`; migration |
| 7.1–7.4 | Extended `/login` + new `/login/2fa`; challenge token; no-2FA passthrough |
| 8.1–8.3 | `2fa/status` endpoint + `TwoFactorSection` French labels + error banner |

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Change-password guard and round-trip

*For any* stored user credential (hash of an arbitrary old password) and any submitted current/new password pair, the change-password operation succeeds if and only if the submitted current password verifies against the stored hash; on success the resulting stored hash verifies the new password, and on failure the stored hash is unchanged.

**Validates: Requirements 3.3, 3.4, 3.5**

### Property 2: TOTP confirmation guard

*For any* generated TOTP secret, submitting a code that is valid for that secret enables TOTP and persists the secret, while submitting any code that is not valid for that secret is rejected and leaves TOTP disabled.

**Validates: Requirements 5.3, 5.4, 5.5**

### Property 3: TOTP login enforcement

*For any* user with TOTP 2FA enabled whose primary credentials are valid, the second login step issues a session token if and only if the submitted TOTP code is valid for that user's stored secret; otherwise it returns a verification error and issues no token.

**Validates: Requirements 7.1, 7.3**

### Property 4: Email 2FA login enforcement

*For any* login for a user with Email 2FA enabled, given the code delivered in the challenge, the second login step issues a session token if and only if the submitted code matches the challenge code within its validity window; otherwise it returns a verification error and issues no token.

**Validates: Requirements 7.2, 7.3**

### Property 5: 2FA status rendering fidelity

*For any* combination of `(totp_enabled, email_2fa_enabled)` returned by the status endpoint, the security page renders the matching French active/inactive label for each method.

**Validates: Requirements 8.2**

## Testing Strategy

**Property tests** (min. 100 iterations each; tag format `Feature: account-security, Property {n}: {text}`):
- Property 1: generate arbitrary old/new passwords, hash the old one, drive the change-password logic with correct vs incorrect current passwords; assert success/failure and hash state (Hypothesis, backend).
- Property 2: generate secrets via `pyotp.random_base32()`, confirm with `pyotp.TOTP(secret).now()` vs perturbed codes; assert enabled/secret state (Hypothesis, backend).
- Properties 3 & 4: generate users/codes; assert token issued iff code valid (Hypothesis + mocked email send, backend).
- Property 5: generate the 4 status combinations; assert rendered French labels (fast-check or table-driven React test, frontend).

**Unit / example tests**: change-password audit row (3.6), reset-by-email invocation (4.2, 4.3), TOTP setup response shape (5.1), email-2FA enable persistence (6.1), no-2FA login passthrough (7.4), status fetch on mount (8.1), status error banner (8.3), header link rendering + navigation target (1.1, 1.2, 1.4), route registration + unauthenticated redirect (2.1, 2.2), section rendering (2.4, 3.1, 5.2).

**Migration test / smoke**: apply the migration and assert the three columns exist (5.6, 6.2); verify upgrade/downgrade run cleanly.

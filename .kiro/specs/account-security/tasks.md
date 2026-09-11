# Implementation Plan: Account Security

## Overview

This plan implements account security management across the FastAPI backend and the React/TypeScript frontend. Work proceeds bottom-up: backend dependency and data-model foundations first (pyotp, User columns, migration, TOTP helpers, schemas), then the authenticated endpoints (change-password, 2FA status/setup/confirm/disable, email-2FA, extended login + second-step verification, 2FA email), followed by frontend services and UI that consume the finished endpoints (securityService, SecurityPage, extended authService/LoginPage, Layout header entry, App route). Property tests validate the five design correctness properties and are placed next to the code they cover; example/unit tests and a migration smoke test round out coverage.

## Tasks

- [x] 1. Backend foundations: dependency, data model, migration, TOTP helpers, schemas
  - [x] 1.1 Add pyotp dependency
    - Add `pyotp==2.9.0` under the "Authentication & Security" section of `requirements.txt`
    - _Requirements: 5.1_

  - [x] 1.2 Add 2FA columns to the User model
    - In `app/models/user.py` add `totp_secret` (nullable `String(64)`), `totp_enabled` (Boolean, `server_default="false"`, not null, default False), `email_2fa_enabled` (Boolean, `server_default="false"`, not null, default False)
    - _Requirements: 5.6, 6.2_

  - [x] 1.3 Create the Alembic migration for the 2FA columns
    - Add `migrations/versions/<rev>_add_account_security_2fa_fields.py` chaining from the current head
    - `upgrade()` adds the three columns with `server_default="false"` on booleans so existing rows backfill safely; `downgrade()` drops the three columns
    - _Requirements: 5.6, 6.2_

  - [x]* 1.4 Write a migration smoke test
    - Apply the migration and assert the three columns exist on `users`; verify upgrade/downgrade run cleanly
    - _Requirements: 5.6, 6.2_

  - [x] 1.5 Implement TOTP helpers in `app/auth/totp.py`
    - Add `generate_secret()`, `provisioning_uri(secret, account_email)`, and `verify_code(secret, code, valid_window=1)` as thin wrappers over `pyotp` with `ISSUER = "OPCP"`
    - Guard `verify_code` against empty secret/code
    - _Requirements: 5.1, 5.3_

  - [x] 1.6 Add request/response schemas in `app/auth/schemas.py`
    - Add `ChangePasswordRequest`, `TwoFactorStatusResponse`, `TotpSetupResponse`, `TotpConfirmRequest`, `Login2FARequest`, `Login2FAChallengeResponse`
    - Reuse the existing password-complexity validator for `ChangePasswordRequest.new_password`
    - _Requirements: 3.2, 5.1, 5.3, 7.1, 7.2, 8.2_

- [x] 2. Password management endpoints
  - [x] 2.1 Implement `POST /api/auth/change-password`
    - Depend on `get_current_user`; verify current password via `verify_password`; on mismatch return `401 INVALID_CREDENTIALS` with no change; on success set `password_hash = hash_password(new_password)`, write `AuditLog(action="PASSWORD_CHANGED")`, commit; return French success message
    - Apply `@limiter.limit("10/hour")`
    - _Requirements: 3.3, 3.4, 3.5, 3.6, 3.7_

  - [x]* 2.2 Write property test for change-password guard and round-trip
    - **Property 1: Change-password guard and round-trip**
    - **Validates: Requirements 3.3, 3.4, 3.5**
    - Generate arbitrary old/new passwords, hash the old one, drive change-password with correct vs incorrect current passwords; assert success iff current password verifies, new hash verifies new password on success, hash unchanged on failure (Hypothesis)

  - [x]* 2.3 Write unit test for change-password audit logging
    - Assert an `AuditLog` row with `action="PASSWORD_CHANGED"` is written on success
    - _Requirements: 3.6_

- [x] 3. Two-factor status and management endpoints
  - [x] 3.1 Implement `GET /api/auth/2fa/status`
    - Depend on `get_current_user`; return `{ totp_enabled, email_2fa_enabled }`; never return `totp_secret`
    - _Requirements: 8.1, 8.2_

  - [x] 3.2 Implement `POST /api/auth/2fa/totp/setup`
    - Depend on `get_current_user`; generate a secret, store as pending (`totp_secret` set, `totp_enabled` stays false); return `{ secret, otpauth_uri }`
    - Apply `@limiter.limit("10/hour")`
    - _Requirements: 5.1, 5.2_

  - [x] 3.3 Implement `POST /api/auth/2fa/totp/confirm`
    - Depend on `get_current_user`; validate code with `totp.verify_code(user.totp_secret, code)`; on invalid return `400 INVALID_2FA_CODE` leaving `totp_enabled=false`; on valid set `totp_enabled=true`, write `AuditLog(action="TOTP_2FA_ENABLED")`, commit; return `{ totp_enabled: true }`
    - _Requirements: 5.3, 5.4, 5.5_

  - [x]* 3.4 Write property test for TOTP confirmation guard
    - **Property 2: TOTP confirmation guard**
    - **Validates: Requirements 5.3, 5.4, 5.5**
    - Generate secrets via `pyotp.random_base32()`, confirm with `pyotp.TOTP(secret).now()` vs perturbed codes; assert enabled/secret state matches validity (Hypothesis)

  - [x] 3.5 Implement `POST /api/auth/2fa/totp/disable`
    - Depend on `get_current_user`; set `totp_enabled=false`, clear `totp_secret`, write `AuditLog(action="TOTP_2FA_DISABLED")`; return `{ totp_enabled: false }`
    - _Requirements: 8.2_

  - [x] 3.6 Implement `POST /api/auth/2fa/email/enable` and `POST /api/auth/2fa/email/disable`
    - Enable: set `email_2fa_enabled=true`, write `AuditLog(action="EMAIL_2FA_ENABLED")`, return `{ email_2fa_enabled: true }`
    - Disable: set `email_2fa_enabled=false`, write `AuditLog(action="EMAIL_2FA_DISABLED")`, return `{ email_2fa_enabled: false }`
    - _Requirements: 6.1_

  - [x]* 3.7 Write unit test for email-2FA enable persistence
    - Assert `email_2fa_enabled` is persisted true after enable
    - _Requirements: 6.1_

  - [x]* 3.8 Write unit test for TOTP setup response shape
    - Assert `setup` returns `secret` and `otpauth_uri` and leaves `totp_enabled` false
    - _Requirements: 5.1_

- [x] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Two-factor login enforcement
  - [x] 5.1 Add `send_2fa_code_email` to `app/services/email.py`
    - Add `send_2fa_code_email(to_email, code, user_name) -> bool`, mirroring the existing French reset email and reusing `send_email`
    - _Requirements: 7.2_

  - [x] 5.2 Extend `POST /api/auth/login` for the 2FA challenge
    - Keep primary credential/email-verification/rate-limit validation unchanged
    - No 2FA → unchanged `LoginResponse` with `access_token` (passthrough)
    - 2FA enabled → return `{ requires_2fa: true, methods, challenge_token }`; for the email method generate a 6-digit code, send it via `send_2fa_code_email`, and embed its hash (`code_hash`) in a short-lived (~5 min) `type: "2fa_challenge"` JWT
    - _Requirements: 7.1, 7.2, 7.4_

  - [x] 5.3 Implement `POST /api/auth/login/2fa`
    - Verify challenge token (`type == "2fa_challenge"`, not expired) and resolve user; validate code (TOTP → `totp.verify_code`; email → hash match against `code_hash`)
    - Invalid → `401 INVALID_2FA_CODE`, no token, `AuditLog(action="LOGIN_2FA_FAILED")`; valid → issue session token, `AuditLog(action="LOGIN_SUCCESS")`
    - Apply `@limiter.limit("20/hour")`
    - _Requirements: 7.1, 7.2, 7.3_

  - [x]* 5.4 Write property test for TOTP login enforcement
    - **Property 3: TOTP login enforcement**
    - **Validates: Requirements 7.1, 7.3**
    - Generate users with valid primary creds and TOTP enabled; assert `/login/2fa` issues a token iff the submitted TOTP code is valid for the stored secret, else a verification error and no token (Hypothesis)

  - [x]* 5.5 Write property test for Email 2FA login enforcement
    - **Property 4: Email 2FA login enforcement**
    - **Validates: Requirements 7.2, 7.3**
    - Generate logins for users with Email 2FA enabled; assert `/login/2fa` issues a token iff the submitted code matches the challenge code within validity, else a verification error and no token (Hypothesis + mocked email send)

  - [x]* 5.6 Write unit test for no-2FA login passthrough
    - Assert a user without any 2FA receives an `access_token` from `/login` with no challenge step
    - _Requirements: 7.4_

- [x] 6. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Frontend security service
  - [x] 7.1 Implement `services/securityService.ts`
    - Add `TwoFactorStatus` and `TotpSetup` interfaces and `securityService` with `changePassword`, `getTwoFactorStatus`, `startTotpSetup`, `confirmTotp`, `disableTotp`, `enableEmail2fa`, `disableEmail2fa`, all routed through the existing `api` client
    - _Requirements: 3.2, 5.1, 5.3, 6.1, 8.1_

- [x] 8. Frontend login 2FA second step
  - [x] 8.1 Extend `services/authService.ts` for the 2FA step
    - `login()` branches on `requires_2fa` and returns the challenge (methods + `challenge_token`) without storing a token; add `verifyLogin2fa(challengeToken, code)` calling `POST /auth/login/2fa` and storing `access_token`/`user` on success
    - _Requirements: 7.1, 7.2_

  - [x] 8.2 Extend `LoginPage` with the second-step code input
    - Render a code input when `login()` returns `requires_2fa`; submit via `verifyLogin2fa`; show a French verification error on failure
    - _Requirements: 7.1, 7.2, 7.3_

- [x] 9. Frontend security page
  - [x] 9.1 Implement password section of `pages/SecurityPage.tsx`
    - French UI with current-password + new-password inputs and submit calling `securityService.changePassword`; a "Réinitialiser par Email" button calling `authService.requestPasswordReset(currentUser.email)` (email read from `localStorage` `user`); French success/error banners for both
    - _Requirements: 2.3, 2.4, 3.1, 3.2, 3.7, 4.1, 4.2, 4.4_

  - [x] 9.2 Implement two-factor section of `pages/SecurityPage.tsx`
    - On mount call `getTwoFactorStatus()` and render French active/inactive labels for TOTP and Email 2FA, or a French error banner on failure
    - TOTP flow: start setup, render QR from `otpauth_uri` plus the secret text while pending, and a confirm-code input; email 2FA is a toggle using enable/disable
    - _Requirements: 2.4, 5.2, 5.3, 6.1, 8.1, 8.2, 8.3_

  - [x]* 9.3 Write property test for 2FA status rendering fidelity
    - **Property 5: 2FA status rendering fidelity**
    - **Validates: Requirements 8.2**
    - Generate all four `(totp_enabled, email_2fa_enabled)` combinations; assert the matching French active/inactive label renders for each method (fast-check or table-driven React test)

  - [x]* 9.4 Write unit tests for the security page
    - Status fetch on mount (8.1), status error banner (8.3), password/2FA section rendering (2.4, 3.1, 5.2), reset-by-email invocation (4.2)
    - _Requirements: 2.4, 3.1, 4.2, 5.2, 8.1, 8.3_

- [x] 10. Frontend routing and header entry
  - [x] 10.1 Register the `/account/security` route in `App.tsx`
    - Add `<Route path="/account/security" element={<ProtectedRoute><SecurityPage /></ProtectedRoute>} />` inside the `Layout`-wrapped routes so unauthenticated access redirects to `/login`
    - _Requirements: 2.1, 2.2_

  - [x] 10.2 Add the header security entry in `Layout.tsx`
    - Desktop: icon-only `Link to="/account/security"` next to "Déconnexion" using `bg-white/15 border border-white/30 text-white` styling with `aria-label="Sécurité du compte"`
    - Mobile menu: labeled "Sécurité du compte" `Link` in the authenticated block that closes the menu on click
    - _Requirements: 1.1, 1.2, 1.3, 1.4_

  - [x]* 10.3 Write unit tests for header link and route
    - Header link rendering + navigation target (1.1, 1.2, 1.4); route registration + unauthenticated redirect (2.1, 2.2)
    - _Requirements: 1.1, 1.2, 1.4, 2.1, 2.2_

- [x] 11. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP.
- Each task references specific requirements for traceability.
- Checkpoints ensure incremental validation.
- Property tests validate the five universal correctness properties from the design (Properties 1-5).
- Unit tests validate specific examples and edge cases.
- Reset-by-email (Requirement 4) reuses the existing `/api/auth/password-reset` endpoint; no new backend endpoint is required.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.5"] },
    { "id": 1, "tasks": ["1.3", "1.6"] },
    { "id": 2, "tasks": ["1.4", "2.1", "3.1", "3.2", "3.3", "3.5", "3.6", "5.1"] },
    { "id": 3, "tasks": ["2.2", "2.3", "3.4", "3.7", "3.8", "5.2"] },
    { "id": 4, "tasks": ["5.3", "7.1", "8.1"] },
    { "id": 5, "tasks": ["5.4", "5.5", "5.6", "8.2", "10.1", "10.2"] },
    { "id": 6, "tasks": ["9.1", "9.2"] },
    { "id": 7, "tasks": ["9.3", "9.4", "10.3"] }
  ]
}
```

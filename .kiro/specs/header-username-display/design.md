# Design Document

## Overview

This feature surfaces the currently authenticated user's identifier inside the "OPCP" label of the shared top banner (`Layout.tsx`). The design has two small parts:

1. A new pure getter, `authService.getCurrentUser()`, that reads and JSON-parses the `user` key from `localStorage`, returning the parsed object or `null` (on absence or parse failure).
2. A pure label-computation step inside `Layout` that derives a display suffix from the current user (email, else full name, else nothing) and renders it in the OPCP link across both the desktop and mobile presentations.

The change is intentionally minimal: no new components, no routing, no network calls. All logic is synchronous and reads from `localStorage`, matching how `Layout` already reads auth state (`isAuthenticated`, `isAdmin`).

## Architecture

```
localStorage
  key "user"  ──JSON──▶  authService.getCurrentUser(): User | null
                                     │
                                     ▼
                       Layout: computeHeaderLabel(user) ──▶ "OPCP (…)" | "OPCP"
                                     │
                        ┌────────────┴────────────┐
                        ▼                          ▼
              Desktop banner OPCP <Link>   Mobile banner OPCP <Link>
```

- **authService** owns all reading/parsing of the persisted user. `Layout` never touches `localStorage['user']` directly; it depends only on `getCurrentUser()`. This keeps the parsing contract (Requirement 4) in one place.
- **Layout** owns presentation. It calls `getCurrentUser()` once per render and computes the label with a small pure helper. The same computed label string feeds both banner presentations, guaranteeing desktop/mobile consistency (Requirement 3).

## Components and Interfaces

### authService.getCurrentUser()

A new getter added to the existing `authService` object in `frontend/src/services/authService.ts`. It reuses the existing `AuthResponse['user']` shape.

```typescript
export type CurrentUser = NonNullable<AuthResponse['user']>;
// {
//   id: string;
//   email: string;
//   first_name: string;
//   last_name: string;
//   role: string;
//   is_email_verified: boolean;
// }

// Added to the authService object:
getCurrentUser(): CurrentUser | null {
  const raw = localStorage.getItem('user');
  if (raw === null) {
    return null;                       // Requirement 4.2: absent -> null
  }
  try {
    return JSON.parse(raw) as CurrentUser; // Requirement 4.1: parsed object
  } catch {
    return null;                       // Requirement 4.3: unparseable -> null
  }
}
```

Notes:
- The getter never throws; malformed JSON is swallowed and reported as `null`.
- It performs no shape validation beyond the JSON parse. Callers (the label helper) treat any missing field defensively (see below).

### Layout: computeHeaderLabel helper

A pure, module-level function in `frontend/src/components/Layout.tsx` (kept local since it is only used here). It encodes the precedence rule from Requirements 1 and 2.

```typescript
import { authService } from '../services/authService';
import type { CurrentUser } from '../services/authService';

// Pure precedence rule:
//   email present (non-empty, trimmed) -> "OPCP (email)"
//   else full name present             -> "OPCP (First Last)"
//   else / no user                     -> "OPCP"
export function computeHeaderLabel(user: CurrentUser | null): string {
  if (!user) {
    return 'OPCP';                                   // Requirement 2.1
  }

  const email = (user.email ?? '').trim();
  if (email.length > 0) {
    return `OPCP (${email})`;                        // Requirement 1.1
  }

  const fullName = `${(user.first_name ?? '').trim()} ${(user.last_name ?? '').trim()}`.trim();
  if (fullName.length > 0) {
    return `OPCP (${fullName})`;                      // Requirement 1.2
  }

  return 'OPCP';                                       // fallback: no usable identifier
}
```

Within the `Layout` component body:

```typescript
export const Layout = ({ children }: LayoutProps) => {
  const isAuthenticated = authService.isAuthenticated();
  const isAdmin = authService.isAdmin();
  const headerLabel = computeHeaderLabel(authService.getCurrentUser());
  // ...
};
```

The single `headerLabel` value replaces the hard-coded `OPCP` text in both banner links:

- Desktop banner link (top of the `<nav>`).
- Mobile banner: the shared top banner's OPCP link is the same `<nav>` element rendered on all viewports; the label is set once and therefore already consistent across desktop and mobile. The mobile dropdown menu (below the banner) does not repeat the OPCP brand label, so only the banner link changes.

Because both presentations derive from the one `headerLabel` string, Requirement 3 (consistency) holds by construction.

## Data Models

### CurrentUser

Reuses the shape already declared in `authService.ts` under `AuthResponse['user']`:

| Field               | Type    | Used by this feature                    |
| ------------------- | ------- | --------------------------------------- |
| `id`                | string  | no                                      |
| `email`             | string  | yes — primary identifier                |
| `first_name`        | string  | yes — fallback identifier (with last)   |
| `last_name`         | string  | yes — fallback identifier (with first)  |
| `role`              | string  | no                                      |
| `is_email_verified` | boolean | no                                      |

The persisted value is written by `authService.login()` via `localStorage.setItem('user', JSON.stringify(user))`, which is the round-trip counterpart to `getCurrentUser()`.

## Error Handling

- **Absent `user` key**: `getCurrentUser()` returns `null`; the label falls through to plain `"OPCP"`.
- **Unparseable `user` value** (corrupted/partial write, manual tampering): `JSON.parse` throws; the `try/catch` converts it to `null`. The header degrades gracefully to `"OPCP"` rather than crashing the shared layout that wraps every page.
- **Well-formed JSON but missing/empty identifier fields**: `computeHeaderLabel` uses `??`/`.trim()` guards so a user object with an empty email and empty names renders `"OPCP"` instead of `"OPCP ()"` or `"OPCP ( )"`.
- No network or async paths are introduced, so there are no request-failure states to handle.

## Testing Strategy

**Dual approach.** Property-based tests cover the universal rendering/parsing rules; example-based DOM tests cover the desktop/mobile wiring and the concrete null/absent edge cases.

- **Framework**: Vitest + `@testing-library/react` + `fast-check`, following the existing pattern in `frontend/src/components/Layout.prereq.test.tsx` (seed `localStorage` before render, render `Layout` inside `MemoryRouter`, quantify with `fc.assert`/`fc.property`).
- **Property tests**: minimum 100 iterations each; each test tagged `Feature: header-username-display, Property {n}: {property_text}` and referencing its design property.
  - Property 1 (label precedence) — pure test over `computeHeaderLabel` with generated user states, plus a rendered-DOM assertion that the banner OPCP link text equals the computed label.
  - Property 2 (`getCurrentUser` round-trip) — generate `CurrentUser` objects, `setItem('user', JSON.stringify(u))`, assert `getCurrentUser()` deep-equals `u`.
  - Property 3 (`getCurrentUser` null on unparseable) — generate non-JSON strings, assert `getCurrentUser()` returns `null` without throwing.
- **Example / edge-case tests**:
  - Requirement 3 wiring: render `Layout` for (a) authenticated with email, (b) authenticated with empty email + names, (c) unauthenticated, and assert the OPCP banner link text on desktop and mobile presentations.
  - Requirement 4.2: cleared `localStorage` → `getCurrentUser()` returns `null` (also the null branch of Property 2).

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Header label follows the identifier precedence rule

*For any* current-user state, `computeHeaderLabel` (and the OPCP banner link that renders it) SHALL produce: `"OPCP (email)"` when the user exists with a non-empty email; otherwise `"OPCP (First Last)"` when the user exists with an empty/absent email but a non-empty full name; otherwise plain `"OPCP"` (when the user is `null`, or has no usable email or name).

**Validates: Requirements 1.1, 1.2, 2.1, 3.1**

### Property 2: getCurrentUser round-trip preserves the stored user

*For any* valid `CurrentUser` object, writing `JSON.stringify(user)` to `localStorage['user']` and then calling `authService.getCurrentUser()` SHALL return an object equal to the original user; and when no value exists under `user`, `getCurrentUser()` SHALL return `null`.

**Validates: Requirements 4.1, 4.2**

### Property 3: getCurrentUser returns null on unparseable input

*For any* string that is not valid JSON, storing it under `localStorage['user']` and calling `authService.getCurrentUser()` SHALL return `null` without throwing.

**Validates: Requirements 4.3**

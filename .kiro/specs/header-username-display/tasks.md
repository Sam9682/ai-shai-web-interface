# Implementation Plan: header-username-display

## Overview

Implement the feature in two small, dependency-ordered pieces, then wire and test them. First add the `getCurrentUser()` getter and `CurrentUser` type to `authService`. Then add the pure `computeHeaderLabel` helper to `Layout` and replace the hard-coded "OPCP" banner text with the computed label. Tests follow the existing `Layout.prereq.test.tsx` pattern (Vitest + Testing Library + fast-check) and cover the three correctness properties plus the null/absent edge cases.

## Tasks

- [x] 1. Add getCurrentUser getter and CurrentUser type to authService
  - [x] 1.1 Add `CurrentUser` type and `getCurrentUser()` to `frontend/src/services/authService.ts`
    - Export `type CurrentUser = NonNullable<AuthResponse['user']>`
    - Add `getCurrentUser(): CurrentUser | null` to the `authService` object
    - Read `localStorage.getItem('user')`; return `null` when absent
    - `JSON.parse` the raw value inside a `try/catch`; return parsed object on success, `null` on parse failure (never throw)
    - _Requirements: 4.1, 4.2, 4.3_

  - [x]* 1.2 Write property test for getCurrentUser round-trip
    - **Property 2: getCurrentUser round-trip preserves the stored user**
    - Generate `CurrentUser` objects, `setItem('user', JSON.stringify(u))`, assert `getCurrentUser()` deep-equals `u`; assert `null` when no value stored
    - Minimum 100 iterations; tag `Feature: header-username-display, Property 2`
    - **Validates: Requirements 4.1, 4.2**

  - [x]* 1.3 Write property test for getCurrentUser null on unparseable input
    - **Property 3: getCurrentUser returns null on unparseable input**
    - Generate non-JSON strings, store under `localStorage['user']`, assert `getCurrentUser()` returns `null` without throwing
    - Minimum 100 iterations; tag `Feature: header-username-display, Property 3`
    - **Validates: Requirements 4.3**

- [x] 2. Add computeHeaderLabel helper and wire it into Layout
  - [x] 2.1 Add pure `computeHeaderLabel(user)` helper to `frontend/src/components/Layout.tsx`
    - Import `authService` and `type CurrentUser` from `../services/authService`
    - Module-level exported pure function encoding precedence: non-empty trimmed email → `"OPCP (email)"`; else non-empty trimmed full name (`first_name` + `last_name`) → `"OPCP (First Last)"`; else `"OPCP"`
    - Guard missing/empty fields with `??` and `.trim()` so an empty user renders `"OPCP"` (never `"OPCP ()"`)
    - _Requirements: 1.1, 1.2, 2.1_

  - [x] 2.2 Wire computed label into the shared top banner link
    - In the `Layout` component body, compute `const headerLabel = computeHeaderLabel(authService.getCurrentUser());`
    - Replace the hard-coded `OPCP` text in the banner OPCP `<Link>` with `headerLabel`
    - Ensure the single `headerLabel` value feeds both desktop and mobile presentations of the shared top banner
    - _Requirements: 1.1, 1.2, 2.1, 3.1_

  - [x]* 2.3 Write property test for header label precedence
    - **Property 1: Header label follows the identifier precedence rule**
    - Pure test over `computeHeaderLabel` with generated user states, plus a rendered-DOM assertion that the banner OPCP link text equals the computed label
    - Minimum 100 iterations; tag `Feature: header-username-display, Property 1`
    - **Validates: Requirements 1.1, 1.2, 2.1, 3.1**

  - [x]* 2.4 Write example/edge-case DOM tests for banner wiring
    - Follow `frontend/src/components/Layout.prereq.test.tsx`: seed `localStorage`, render `Layout` inside `MemoryRouter`
    - (a) authenticated with email, (b) authenticated with empty email + names, (c) unauthenticated → assert OPCP banner link text on desktop and mobile presentations
    - Cleared `localStorage` → `getCurrentUser()` returns `null` and banner shows plain `"OPCP"`
    - _Requirements: 3.1, 4.2_

- [x] 3. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Property tests validate the universal precedence and parsing rules; example tests validate desktop/mobile wiring and null/absent edge cases
- Task 2 depends on the `CurrentUser` type and `getCurrentUser()` from Task 1

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3", "2.1"] },
    { "id": 2, "tasks": ["2.2"] },
    { "id": 3, "tasks": ["2.3", "2.4"] }
  ]
}
```

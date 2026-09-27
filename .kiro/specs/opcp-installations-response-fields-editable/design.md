# OPCP Installations "Réponse client" Editable Fields Bugfix Design

## Overview

In the OPCP Installations area, each question/answer (QA) tab — Network Checklist,
Core Control Plane, CloudStore, and VCF — renders a "Réponse client" input per row.
Those inputs are meant to be filled in by the people running an installation and
persisted per installation instance. Today they are gated so that only an
authenticated **non-administrator** can edit and save them. Administrators (and
unauthenticated visitors) get a `disabled`/`readOnly` field with a `cursor-not-allowed`
style, and the backend refuses admin saves with HTTP 403 `ANSWER_NOT_ALLOWED_FOR_ADMIN`.

The intended editor is *any authenticated user, including administrators*. The fix
relaxes the gate in two mirrored places:

1. **Frontend** (`QuestionAnswerForm.tsx`): change `canAnswer` from
   `isAuthenticated() && !isAdmin()` to just `isAuthenticated()`, so the "Réponse
   client" input renders editable for every authenticated user across all QA tabs.
2. **Backend** (`app/prerequisites/router.py`): relax `get_answering_member` so any
   authenticated user (administrators included) may persist an answer, removing the
   admin-only 403 block while keeping per-installation, shared, last-write-wins
   semantics and `updated_by` tracking.

VCF JSON generation is unaffected structurally — `buildVcfDomainJson` already overlays
the current in-memory `answers` onto the domain templates. The fix simply makes those
answers enterable/savable by the intended editor so there is real data to overlay.

The approach is deliberately minimal: it changes only the authorization predicate on
both ends and the field's editable/read-only rendering that follows from it. Every
other behavior (persistence scoping, VCF structure and type coercion, read-only
Servers tab, admin-only static content and installation CRUD, 404 semantics) is
preserved.

## Glossary

- **Bug_Condition (C)**: The condition that triggers the bug — an authenticated user
  who is blocked from editing/persisting a "Réponse client" field on a QA tab because
  the current gate additionally requires "not an administrator".
- **Property (P)**: The desired behavior — for any authenticated user (admins
  included), the "Réponse client" field is editable, typed values are captured and
  persisted per installation, and VCF JSON overlays those values onto the templates.
- **Preservation**: All non-bug inputs behave identically after the fix — mouse
  behavior, other keys, non-QA tabs, unauthenticated users, VCF structure/type
  coercion, per-installation shared persistence, and 404 semantics stay unchanged.
- **canAnswer**: The frontend predicate in `QuestionAnswerForm.tsx` that decides
  whether the "Réponse client" input is editable. Currently
  `isAuthenticated() && !isAdmin()`; after the fix `isAuthenticated()`.
- **get_answering_member**: The FastAPI dependency in `app/prerequisites/router.py`
  authorizing answer saves. Currently rejects administrators with 403
  `ANSWER_NOT_ALLOWED_FOR_ADMIN`; after the fix authorizes any authenticated user.
- **QA tab / QA slug**: A question/answer tab (`network-checklist`,
  `core-control-plane`, `cloudstore`, `vcf`) whose form is rendered by
  `QuestionAnswerForm` and whose answers are stored via the answers endpoint.
- **buildVcfDomainJson**: The VCF-only function in `vcfDomainTemplates.ts` that
  overlays current answers onto the management/workload domain templates,
  preserving each template value's JSON type.

## Bug Details

### Bug Condition

The bug manifests when an authenticated user opens a QA tab and the "Réponse client"
input is rendered non-editable, or attempts to save an answer and the backend rejects
it, *solely because the user is an administrator*. The gate that drives both the
`disabled`/`readOnly` rendering (`canAnswer`) and the backend authorization
(`get_answering_member`) requires the user to be authenticated **and not** an
administrator, so authenticated administrators are wrongly blocked.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input = { tab: ChecklistTab, user: User, action: 'render' | 'edit' | 'save' }
  OUTPUT: boolean

  // The intended editor is any authenticated user, including administrators.
  // The bug fires on a QA tab whenever such a user is blocked by the extra
  // "not an administrator" clause in the current gate.
  RETURN input.tab.kind = 'qa'
         AND isAuthenticated(input.user)
         AND NOT canAnswer(input.user)   // canAnswer = isAuthenticated AND NOT isAdmin
                                         // => true only for authenticated admins here
END FUNCTION
```

### Examples

- An authenticated administrator opens the VCF tab. The "Réponse client" input next
  to `node_uuids (management)` renders `disabled`/`readOnly` with a "not-allowed"
  cursor. Expected: an editable field.
- An administrator opens the Network Checklist tab and tries to type into a "Réponse
  client" input. Nothing is captured. Expected: the typed value appears and is held
  in state.
- An administrator finishes editing a "Réponse client" value on the CloudStore tab;
  the save request is rejected with HTTP 403 `ANSWER_NOT_ALLOWED_FOR_ADMIN` and the
  value is not persisted. Expected: the save succeeds and persists per installation.
- Edge case (unchanged): an **unauthenticated** visitor opens any QA tab. The field
  is (and remains) non-editable — this is *not* the bug condition because the user is
  not authenticated.
- Edge case (unchanged): an authenticated non-admin member opens any QA tab. The
  field is (and remains) editable and savable — already correct, so not the bug.

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Authenticated non-admin members continue to edit and save "Réponse client" values
  exactly as before.
- Unauthenticated visitors continue to see the field non-editable (read-only), since
  `canAnswer` still requires authentication.
- Per-installation, shared, last-write-wins persistence semantics stay unchanged;
  `updated_by` continues to record the last editor.
- The answers load contract (`GET .../answers` returning `{ row_id: answer }`) and
  per-row error surfacing on save failure stay unchanged.
- VCF JSON generation keeps its exact key set, type coercion (booleans stay boolean,
  quoted numeric fields stay strings), and non-customer defaults (`debug`,
  `openstack_*`, `pairing_source`, ...).
- The "Servers nodes" tab (rendered by `ServersTable`) stays a read-only inventory
  with no editable "Réponse client" fields.
- Admin-only static content PUT and admin-only installation CRUD stay unchanged.
- Structured 404 semantics (`INSTALLATION_NOT_FOUND` / `PREREQUISITE_SLUG_NOT_FOUND`)
  stay unchanged on load and save.

**Scope:**
All inputs that do NOT involve an authenticated user being blocked on a QA tab by the
"not an administrator" clause are completely unaffected by this fix. This includes:
- Unauthenticated access to QA tabs (field stays read-only).
- Non-QA tabs (Basics, Network Flux static content; Servers nodes inventory).
- Static-content saves and installation CRUD (still admin-only).
- The VCF JSON generation structure and type rules.

**Note:** The expected correct behavior for buggy inputs is defined in the
Correctness Properties section (Property 1). This section focuses on what must NOT
change.

## Hypothesized Root Cause

Based on the bug description and code review, the cause is a mismatched authorization
predicate applied in two mirrored places:

1. **Frontend gate over-restricts editing**: In `QuestionAnswerForm.tsx`,
   `canAnswer = authService.isAuthenticated() && !authService.isAdmin()`. The
   `!isAdmin()` clause makes the input `disabled`/`readOnly` with `cursor-not-allowed`
   for administrators, so it cannot be edited. Removing the `!isAdmin()` clause
   (`canAnswer = authService.isAuthenticated()`) is the targeted correction.

2. **Backend dependency over-restricts saving**: In `app/prerequisites/router.py`,
   `get_answering_member` raises 403 `ANSWER_NOT_ALLOWED_FOR_ADMIN` when
   `current_user.role == UserRole.ADMINISTRATOR`. Even if the frontend allowed typing,
   the admin's `onBlur` save would fail. Relaxing this dependency to authorize any
   authenticated user is the mirrored correction.

3. **Not a data-mapping or DOM issue**: VCF generation and the answers load/save
   contract are correct; they simply had no admin-entered data to work with. The VCF
   overlay (`buildVcfDomainJson`) and the `{ row_id: answer }` map need no change.

4. **Not a persistence-scoping issue**: Answers are already shared per installation
   (no `user_id` scoping) with `updated_by` recording the last editor. The fix must
   not alter this scoping.

## Correctness Properties

Property 1: Bug Condition - Editable and Persistable "Réponse client" for Any Authenticated User

_For any_ input where the bug condition holds (`isBugCondition` returns true — an
authenticated user, including an administrator, on a QA tab), the fixed function SHALL
render the "Réponse client" input as editable (not `disabled`, not `readOnly`, without
the "not-allowed" cursor), SHALL capture typed values in component state, SHALL persist
the value for the current installation instance via the answers endpoint (accepting the
save for administrators as well), and — on the VCF tab — SHALL generate the domain JSON
by overlaying the current "Réponse client" values onto the domain template for every
mapped key with a non-empty value.

**Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6**

Property 2: Preservation - Non-Buggy Inputs Behave Identically

_For any_ input where the bug condition does NOT hold (`isBugCondition` returns false —
unauthenticated visitors, authenticated non-admin members, non-QA tabs, static-content
saves, installation CRUD, VCF structure/type rules, and 404 semantics), the fixed
function SHALL produce the same result as the original function, preserving
per-installation shared last-write-wins persistence, the `{ row_id: answer }` load
contract, the read-only Servers inventory, admin-only static content and installation
mutations, VCF key set and JSON type coercion, and structured 404 responses.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct, two mirrored authorization changes are
needed.

**File**: `frontend/src/components/prerequisites/QuestionAnswerForm.tsx`

**Function**: `QuestionAnswerForm` (component body)

**Specific Changes**:
1. **Relax the editable gate**: Change
   `const canAnswer = authService.isAuthenticated() && !authService.isAdmin();`
   to `const canAnswer = authService.isAuthenticated();`. This flips the field to
   editable for authenticated administrators while keeping unauthenticated visitors
   read-only.
2. **No changes to rendering wiring**: The existing `readOnly={!canAnswer}`,
   `disabled={!canAnswer}`, `className={canAnswer ? FIELD_CLASS : READONLY_FIELD_CLASS}`,
   and `onBlur` guard (`if (canAnswer) void saveAnswer(...)`) all derive from
   `canAnswer` and require no edits — relaxing the predicate is sufficient.
3. **Doc comment update**: Update the component doc comment that states the field is
   "editable only for authenticated non-admin members" to reflect "editable for any
   authenticated user".

**File**: `app/prerequisites/router.py`

**Function**: `get_answering_member`

**Specific Changes**:
4. **Remove the admin block**: Delete the `if current_user.role == UserRole.ADMINISTRATOR:`
   branch that raises 403 `ANSWER_NOT_ALLOWED_FOR_ADMIN`, so the dependency authorizes
   any authenticated user. The dependency continues to depend on `get_current_user`,
   so unauthenticated/invalid-token requests still get 401 before reaching it. The
   `update_answer` handler keeps recording `updated_by=current_user.id` (last editor),
   preserving shared last-write-wins semantics. (The now-unused `ANSWER_NOT_ALLOWED_FOR_ADMIN`
   code and the `UserRole` import may be cleaned up if no longer referenced.)
5. **Doc comment update**: Update the `get_answering_member` docstring to state any
   authenticated user (administrators included) may save answers.

**No changes** to `vcfDomainTemplates.ts` (VCF overlay/type coercion already correct),
to the answers/static-content/installation route shapes, to persistence scoping, or to
`ServersTable`.

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that
demonstrate the bug on unfixed code (authenticated admin blocked from editing/saving),
then verify the fix makes the field editable and persistable for any authenticated
user while preserving all non-buggy behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing the fix.
Confirm or refute the root cause (the `!isAdmin()` clause on the frontend and the admin
403 on the backend). If refuted, re-hypothesize.

**Test Plan**: On the UNFIXED code, render `QuestionAnswerForm` as an authenticated
administrator across QA slugs and assert the "Réponse client" input is editable; and
exercise the backend answer PUT as an administrator and assert it succeeds. These
assertions will fail on the unfixed code, pinpointing the two gates.

**Test Cases**:
1. **Admin Render Editable (frontend)**: Authenticated admin opens a QA tab; assert the
   input is not `readOnly`/`disabled` (will fail on unfixed code).
2. **Admin Save Persists (backend)**: Admin PUT to `.../{slug}/answers/{row_id}`; assert
   HTTP 200 and persistence (will fail on unfixed code with 403 `ANSWER_NOT_ALLOWED_FOR_ADMIN`).
3. **VCF Overlay Uses Admin Answers**: With an admin-entered non-empty answer for a
   mapped VCF row, assert `buildVcfDomainJson` overlays it (will fail indirectly on
   unfixed code because no admin answer can be entered/saved).
4. **Out-of-context Edge**: Unauthenticated visitor on a QA tab; assert the field stays
   read-only (should pass on unfixed code — confirms scope boundary, not the bug).

**Expected Counterexamples**:
- The "Réponse client" input renders `disabled`/`readOnly` for an authenticated admin.
- The backend answer PUT returns 403 `ANSWER_NOT_ALLOWED_FOR_ADMIN` for an admin.
- Possible causes: frontend `canAnswer` includes `!isAdmin()`; backend
  `get_answering_member` blocks administrators.

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed function
produces the expected behavior.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  result := fixedFunction(input)
  ASSERT expectedBehavior(result)
    // rendered input editable (not readOnly, not disabled, no not-allowed cursor)
    // AND typed value captured in state
    // AND value persisted for input's installation via answers endpoint (admins too)
    // AND vcfJson(input) = overlay(domainTemplate, currentAnswers(input))
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed
function produces the same result as the original function.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT originalFunction(input) = fixedFunction(input)
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking
because:
- It generates many test cases automatically across the input domain (QA/non-QA tabs,
  authenticated non-admin vs unauthenticated users, arbitrary answer maps and configs).
- It catches edge cases that manual unit tests might miss (empty answers, boolean and
  quoted-numeric template keys, unmapped VCF keys).
- It provides strong guarantees that non-buggy behavior is unchanged.

**Test Plan**: Observe behavior on UNFIXED code for non-admin members, unauthenticated
visitors, static content, VCF structure, and 404s, then write property-based tests
capturing that behavior and re-run against the fixed code.

**Test Cases**:
1. **Non-admin Member Editing**: Observe that authenticated non-admin members can edit
   and save on unfixed code, then verify this continues after the fix.
2. **Unauthenticated Read-Only**: Observe the field is read-only for unauthenticated
   visitors on unfixed code, then verify it remains read-only after the fix.
3. **VCF Structure and Type Preservation**: Observe VCF JSON key set, defaults, and
   type coercion on unfixed code, then verify unchanged output for arbitrary answer maps.
4. **404 and Admin-Only Mutations**: Observe `INSTALLATION_NOT_FOUND` /
   `PREREQUISITE_SLUG_NOT_FOUND` and admin-only static/CRUD behavior on unfixed code,
   then verify unchanged after the fix.

### Unit Tests

- Frontend: `QuestionAnswerForm` renders an editable "Réponse client" input for an
  authenticated administrator across QA slugs; read-only for an unauthenticated visitor.
- Frontend: typing captures the value in state; `onBlur` triggers a save for an admin;
  a save failure surfaces the per-row error indicator.
- Backend: admin PUT to a QA answers route returns success and upserts the row with
  `updated_by` set; unauthenticated/invalid-token PUT still returns 401.
- Backend: unknown installation/slug still returns the structured 404 on the answers
  routes.

### Property-Based Tests

- Generate arbitrary `QuestionFormConfig` and authenticated users (admin and non-admin);
  assert every "Réponse client" input is editable (Property 1).
- Generate arbitrary `answers` maps and assert `buildVcfDomainJson` output equals the
  overlay of non-empty mapped answers onto the template with type preserved, for both
  domains (Property 2 — VCF structure/type preservation).
- Generate non-QA/unauthenticated inputs and assert rendered/authorization behavior is
  identical before and after the fix (Property 2 — preservation).

### Integration Tests

- Full flow: authenticated admin opens a QA tab, edits several "Réponse client" values,
  they persist per installation, and reopening the tab reloads them.
- Context switching: two installation instances keep their "Réponse client" values
  independent; switching between QA tabs preserves saved values.
- VCF flow: an admin enters values on the VCF tab and "Générer le fichier JSON du
  domaine de management" / "workload" produces JSON overlaying those values while
  keeping template defaults and JSON types for unfilled/non-customer keys.

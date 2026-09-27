# Bugfix Requirements Document

## Introduction

In the "OPCP Installations" area (the "OPCP installations" navigation item, backed
by the prerequisites module), each question/answer tab renders a "Réponse client"
input for every row. Users report that these inputs are not editable: they appear
disabled and show a "no entry" / forbidden cursor when hovered, so no value can be
typed. This affects the question/answer tabs of the aggregate checklist view:
"Network Checklist", "Core Control Plane", "CloudStore", and "VCF".

The current gating logic makes the "Réponse client" input editable only for a user
who is authenticated **and not** an administrator
(`canAnswer = authService.isAuthenticated() && !authService.isAdmin()` in
`frontend/src/components/prerequisites/QuestionAnswerForm.tsx`). For an administrator
(or an unauthenticated visitor), the input is rendered with `readOnly` + `disabled`
and the `cursor-not-allowed` style, which is exactly the observed defect. The backend
mirrors this gate: `get_answering_member` in `app/prerequisites/router.py` returns
HTTP 403 `ANSWER_NOT_ALLOWED_FOR_ADMIN` when an administrator attempts to save an
answer.

The impact is that the intended editors of these installation values cannot enter or
change "Réponse client" values, cannot have them persisted per installation, and — in
the VCF tab — the "Générer le fichier JSON du domaine de management" and "Générer le
fichier JSON du domaine workload" buttons therefore fall back to template defaults
because there are no client-entered values to overlay.

Notes grounding the scope:
- The "Servers nodes" tab is rendered by `ServersTable` as a read-only reference
  inventory and does not contain any "Réponse client" input fields. It is included in
  the report for completeness, but the defect (a disabled editable field) does not
  apply there because no such field exists on that tab.
- Persistence already exists and is per-installation, shared (not user-scoped),
  last-write-wins, via `PUT /api/prerequisites/installations/{installation_id}/{slug}/answers/{row_id}`
  and reloaded via `GET .../answers`. The VCF JSON generation already overlays the
  current in-memory `answers` onto the domain templates via `buildVcfDomainJson`.
  These paths function only when the field can actually be edited and saved.

## Bug Analysis

### Current Behavior (Defect)

The "Réponse client" input is only editable for authenticated non-admin users; every
other user (administrator or unauthenticated) sees a disabled/read-only field, so the
value cannot be edited, cannot be persisted, and is not available as a source for VCF
JSON generation.

1.1 WHEN an authenticated administrator opens any OPCP Installations question/answer tab (Network Checklist, Core Control Plane, CloudStore, VCF) THEN the system renders the "Réponse client" input as `disabled`/`readOnly` with a "not-allowed" cursor so the value cannot be edited
1.2 WHEN a user who is not permitted by the current gate (`canAnswer === false`, e.g. an administrator) attempts to type into a "Réponse client" input THEN the system rejects the input and no value is captured in component state
1.3 WHEN an administrator attempts to save a "Réponse client" value THEN the system (backend `get_answering_member`) rejects the save with HTTP 403 `ANSWER_NOT_ALLOWED_FOR_ADMIN`, so the value is not persisted
1.4 WHEN a "Réponse client" value cannot be entered or persisted for a VCF row THEN the system's "Générer le fichier JSON du domaine de management" / "Générer le fichier JSON du domaine workload" buttons fall back to the template default for that key because no client answer is available to overlay

### Expected Behavior (Correct)

The "Réponse client" inputs must be editable by any authenticated user (including
administrators) across all question/answer tabs, values must persist per installation
instance, and VCF JSON generation must use the current "Réponse client" values as the
source.

2.1 WHEN an authenticated user (including an administrator) opens any OPCP Installations question/answer tab (Network Checklist, Core Control Plane, CloudStore, VCF) THEN the system SHALL render each "Réponse client" input as an editable field (not `disabled`, not `readOnly`, without the "not-allowed" cursor)
2.2 WHEN an authenticated user types into a "Réponse client" input THEN the system SHALL capture the typed value in component state and display it in the field
2.3 WHEN an authenticated user finishes editing a "Réponse client" value (e.g. on blur) THEN the system SHALL persist that value for the current installation instance via the answers endpoint (accepting the save for administrators as well) and SHALL surface a per-row error indicator only if the save fails
2.4 WHEN an authenticated user reopens the same tab for the same installation instance THEN the system SHALL load and display the previously saved "Réponse client" values for that installation
2.5 WHEN two different installation instances are used THEN the system SHALL keep each installation's "Réponse client" values independent of the other's
2.6 WHEN the user activates "Générer le fichier JSON du domaine de management" or "Générer le fichier JSON du domaine workload" in the VCF tab THEN the system SHALL generate the JSON using the current "Réponse client" field values as the source, overlaying them onto the domain template for every key that maps to a VCF row and has a non-empty value

### Unchanged Behavior (Regression Prevention)

Persistence semantics, VCF JSON structure, and the read-only nature of non-editable
content must be preserved.

3.1 WHEN a "Réponse client" value is saved for a given (installation, slug, row) THEN the system SHALL CONTINUE TO persist it per installation as shared, last-write-wins (no per-user scoping) and record the last editor
3.2 WHEN answers are loaded for an installation and slug THEN the system SHALL CONTINUE TO return the `{ row_id: answer }` map and render each saved value in the matching row's "Réponse client" input
3.3 WHEN a VCF "Réponse client" value is left empty for a row THEN the system SHALL CONTINUE TO keep the domain template default for that JSON key, and SHALL CONTINUE TO preserve the template value's JSON type (booleans stay boolean, quoted numeric fields stay strings)
3.4 WHEN the VCF JSON is generated THEN the system SHALL CONTINUE TO emit the same key set and non-customer keys (e.g. `debug`, `openstack_*`, `pairing_source`) with their template defaults
3.5 WHEN a user views the "Servers nodes" tab THEN the system SHALL CONTINUE TO render it as a read-only inventory table with no editable "Réponse client" fields
3.6 WHEN an unknown installation id or an unknown slug is requested on load or save THEN the system SHALL CONTINUE TO return the structured 404 (`INSTALLATION_NOT_FOUND` / `PREREQUISITE_SLUG_NOT_FOUND`)
3.7 WHEN static content tabs (e.g. Basics, Network Flux) and installation CRUD are used THEN the system SHALL CONTINUE TO behave as before (admin-only static-content and installation mutations are unaffected by this fix)

## Deriving the Bug Condition

**Bug Condition Function** — identifies inputs (rendering/save contexts) that trigger the bug:

```pascal
FUNCTION isBugCondition(X)
  INPUT: X = { tab: ChecklistTab, user: User, action: 'render' | 'edit' | 'save' }
  OUTPUT: boolean

  // The intended editor is any authenticated user, including administrators.
  // The defect occurs on a question/answer tab whenever such a user is blocked
  // from editing/persisting the "Réponse client" field by the current
  // authenticated-non-admin-only gate.
  RETURN X.tab.kind = 'qa'
     AND isAuthenticated(X.user)
     AND NOT canAnswer(X.user)   // canAnswer = isAuthenticated AND NOT isAdmin
                                 // => triggers for authenticated administrators
END FUNCTION
```

**Property Specification** — desired behavior for buggy inputs:

```pascal
// Property: Fix Checking — Editable "Réponse client" across QA tabs
FOR ALL X WHERE isBugCondition(X) DO
  fieldState ← F'(X)   // rendered "Réponse client" input for the intended editor
  ASSERT fieldState.editable = true
     AND fieldState.readOnly = false
     AND fieldState.disabled = false
  // and, for a save action, the value is persisted for X's installation instance
  ASSERT persisted(installationOf(X), slugOf(X.tab), rowOf(X)) = enteredValue
  // and, for VCF generation, the current field values are the JSON source
  ASSERT vcfJson(X) = overlay(domainTemplate, currentAnswers(X))
END FOR
```

**Preservation Goal** — non-buggy inputs behave identically after the fix:

```pascal
// Property: Preservation Checking
FOR ALL X WHERE NOT isBugCondition(X) DO
  ASSERT F(X) = F'(X)
END FOR
```

Where:
- **F**: current code — `canAnswer = isAuthenticated() && !isAdmin()`, backend
  `get_answering_member` rejects administrators.
- **F'**: fixed code — the intended editor can edit and persist "Réponse client"
  values on all question/answer tabs, and VCF generation uses those values.
- **Counterexample**: an administrator opens the VCF tab and sees the "Réponse client"
  input next to `node_uuids (management)` rendered disabled with a "not-allowed"
  cursor, and generating the domain JSON only emits template defaults.

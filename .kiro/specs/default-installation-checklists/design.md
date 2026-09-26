# Default Installation Checklists Bugfix Design

## Overview

When a user opens a default installation from the prerequisites entry point, the installation-scoped view shows only the **Network Checklist** section. The other three checklist categories that complete an installation prerequisites review — **Core Control Plane**, **CloudStore**, and **VCF** — are hidden because the entry link (`installationRoute` in `InstallationListPage.tsx`) targets the single `network-checklist` slug, and `InstallationPrereqPage` renders exactly one checklist config for that slug.

The fix makes the default-installation entry view render all four question-archetype checklist categories as stacked sections on a single page. The strategy is to introduce an aggregate "all checklists" rendering path for the default-installation entry, driven by an ordered list of the four existing `QuestionFormConfig` objects, while leaving every other rendering path untouched: static content slugs (`basics`, `network-flux`), unknown-slug not-found handling, the `ProtectedRoute` auth guard, and per-slug answer persistence through `prerequisitesService`.

The change is deliberately minimal and localized. It reuses the existing `QuestionAnswerForm` component (one instance per category, each scoped to its own `slug` so answer persistence keys stay unchanged), the existing `configs.ts` question configs, and the existing route shape. No service, type, or persistence-schema change is required.

## Glossary

- **Bug_Condition (C)**: The condition that triggers the bug — the installation-scoped prerequisites view is opened for a default installation (the entry route resolving to the `network-checklist` slug), which renders a single checklist category instead of the full set.
- **Property (P)**: The desired behavior for the bug condition — the view renders all four checklist categories (Network Checklist, Core Control Plane, CloudStore, VCF), each with its own section content.
- **Preservation**: Existing behavior that must remain unchanged — static content pages (`basics`, `network-flux`), unknown-slug not-found handling, the auth guard redirect, and per-slug answer persistence.
- **`InstallationPrereqPage`**: The component in `frontend/src/pages/InstallationPrereqPage.tsx` that reads `installationId` and `slug` from the route and renders the matching archetype (static / question / not-found). This is the primary file changed by the fix.
- **`installationRoute` / `FIRST_PREREQ_SLUG`**: The helper and constant in `frontend/src/components/prerequisites/InstallationListPage.tsx` that build the entry route each installation row links to. `FIRST_PREREQ_SLUG` is currently `'network-checklist'`.
- **`QuestionAnswerForm`**: The component in `frontend/src/components/prerequisites/QuestionAnswerForm.tsx` that renders one `QuestionFormConfig` (markers, example values, comments hints, per-row client answer inputs) and persists answers per `(installationId, slug)`.
- **`configs.ts`**: `frontend/src/components/prerequisites/configs.ts` — exports the four question configs `networkChecklistConfig`, `coreControlPlaneConfig`, `cloudStoreQuestionConfig`, `vcfConfig`.
- **Checklist category**: One of the four question-archetype prerequisites categories: Network Checklist, Core Control Plane, CloudStore, VCF.
- **Entry route / default-installation entry**: `/prerequisites/installations/:installationId/:slug` reached from an installation row in `InstallationListPage`, where `slug` is the entry slug for a default installation.

## Bug Details

### Bug Condition

The bug manifests when the installation-scoped prerequisites view is opened for a default installation via the entry route. `InstallationListPage.installationRoute` builds that route with the single slug `network-checklist`, and `InstallationPrereqPage` looks up exactly one `PrereqSlugConfig` for that slug and renders one `QuestionAnswerForm`. The Core Control Plane, CloudStore, and VCF categories are therefore never rendered and have no navigation surface — they are reachable only by manually editing the URL slug.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type PrereqView   // { installationId, slug, entryContext }
  OUTPUT: boolean

  // The default-installation entry view renders one checklist category
  // instead of the full set of four checklist categories.
  RETURN input.isDefaultInstallationEntry = true
         AND renderedCategories(current) = { "Network Checklist" }
         AND renderedCategories(current) != { "Network Checklist",
                                              "Core Control Plane",
                                              "CloudStore",
                                              "VCF" }
END FUNCTION
```

### Examples

- **Open a default installation**: User clicks an installation in `InstallationListPage`; the view shows only the Network Checklist section. Expected: all four categories (Network, Core Control Plane, CloudStore, VCF) are shown.
- **Reach Core Control Plane**: User wants to review Core Control Plane prerequisites; there is no link or tab to reach it. Expected: the Core Control Plane section is present on the same default-installation view.
- **Reach CloudStore / VCF**: Same as above — the only way to see these is to hand-edit the URL to `/…/cloudstore` or `/…/vcf`. Expected: both sections render on the default-installation view.
- **Static content slug (edge case, must not change)**: Opening `basics` or `network-flux` still renders the single static content page unchanged.
- **Unknown slug (edge case, must not change)**: Opening an unrecognized slug still renders "Page de prérequis introuvable."

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Static content slugs (`basics`, `network-flux`) must continue to render the single `StaticContentPage` with the same title and content, unchanged.
- An unknown or missing slug must continue to render the not-found message ("Page de prérequis introuvable.").
- An unauthenticated request to any prerequisites route must continue to redirect to `/login` through the `ProtectedRoute` auth guard.
- A non-admin member editing a client answer on any checklist must continue to persist that answer through `prerequisitesService`, scoped to the same `(installationId, slug)` keys as before, so previously saved answers still resolve.
- Each checklist section must continue to show its per-row mandatory/optional markers, example values, comments hints, and read-only versus editable answer inputs according to the user's role.

**Scope:**
All inputs that do NOT match the default-installation entry (the bug condition) must be completely unaffected by this fix. This includes:
- Static content slug views (`basics`, `network-flux`).
- Unknown/missing slug views.
- Unauthenticated access to any prerequisites route.
- Individual client-answer persistence for any single checklist slug.

**Note:** The actual expected correct behavior (rendering all four categories) is defined in the Correctness Properties section (Property 1). This section focuses on what must NOT change.

## Hypothesized Root Cause

Based on the bug analysis and the code, the cause is well understood (this is a design/routing choice rather than a defect in a single function):

1. **Single-slug entry point**: `InstallationListPage.FIRST_PREREQ_SLUG = 'network-checklist'` and `installationRoute(id)` build the entry route to that one slug. The entry point was scoped to a single category rather than the full checklist set.

2. **One-config rendering in `InstallationPrereqPage`**: `PREREQ_SLUG_CONFIG` maps each slug to exactly one `PrereqSlugConfig`, and the component renders a single `QuestionAnswerForm` (or `StaticContentPage`) for the resolved slug. There is no aggregate path that renders the four question configs together.

3. **No navigation surface between categories**: Once on the single-category page, there is no link, tab, or stacked layout to reach the other three categories, so they are unreachable without manual URL editing.

The fix targets causes (1)–(3) together by introducing an aggregate default-installation view that renders all four question configs, so the entry point resolves to the full set rather than one category.

## Correctness Properties

Property 1: Bug Condition - Default installation renders all four checklists

_For any_ default-installation entry view where the bug condition holds (isBugCondition returns true), the fixed `InstallationPrereqPage` SHALL render all four checklist categories — Network Checklist, Core Control Plane, CloudStore, and VCF — each with its own section content (questions, mandatory/optional markers, example values, comments hints, and client answer inputs), reachable without manual URL editing.

**Validates: Requirements 2.1, 2.2, 2.3**

Property 2: Preservation - Non-entry views behave identically

_For any_ input where the bug condition does NOT hold (isBugCondition returns false) — static content slugs (`basics`, `network-flux`), unknown/missing slugs, unauthenticated access, and single-slug client-answer persistence — the fixed code SHALL produce the same result as the original code, preserving the static content pages, the not-found message, the auth-guard redirect, the per-slug answer persistence, and the per-row markers/examples/hints/answer-input role rules.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**

## Fix Implementation

### Changes Required

Assuming the root cause analysis is correct, the fix is localized to the installation-scoped page and the entry-route helper. No changes to `prerequisitesService`, the config data, or the persistence schema.

**File**: `frontend/src/pages/InstallationPrereqPage.tsx`

**Primary change: aggregate default-installation view**

1. **Introduce an ordered checklist set**: Define an ordered list of the four question categories, each as `{ slug, title, config }`, reusing the existing exports from `configs.ts`:
   - `network-checklist` → "Network Checklist" → `networkChecklistConfig`
   - `core-control-plane` → "Core Control Plane" → `coreControlPlaneConfig`
   - `cloudstore` → "CloudStore" → `cloudStoreQuestionConfig`
   - `vcf` → "VCF" → `vcfConfig`

   This list is the single source of truth for both the aggregate render and the per-slug lookup, so the two paths cannot drift.

2. **Render all four categories for the entry slug**: When the resolved slug is the default-installation entry slug, render one `QuestionAnswerForm` per category in order, each stacked as its own section. Each `QuestionAnswerForm` is passed its own `slug` (the category's canonical slug) so that answer persistence remains keyed on `(installationId, slug)` exactly as today — Network Checklist answers still persist under `network-checklist`, etc. This preserves previously saved answers and keeps `prerequisitesService` calls unchanged per category (Property 2, Req 3.4).

3. **Preserve the not-found path**: If `installationId`, `slug`, or the resolved config is missing/unrecognized, continue to render the "Page de prérequis introuvable." message unchanged (Req 3.2).

4. **Preserve the static path**: For `basics` and `network-flux`, continue to render a single `StaticContentPage` with the same title (Req 3.1).

5. **Preserve single-category direct access**: Directly navigating to a single question slug (e.g. `/…/vcf`) continues to render that one category via `QuestionAnswerForm`, so hand-edited URLs and any existing links keep working. Only the default-installation entry path renders the aggregate set.

**File**: `frontend/src/components/prerequisites/InstallationListPage.tsx`

6. **Align the entry route with the aggregate view**: Keep `installationRoute(id)` pointing at the default-installation entry so an installation row lands on the aggregate all-checklists view. `FIRST_PREREQ_SLUG` remains the entry slug (`network-checklist`) that `InstallationPrereqPage` recognizes as the aggregate trigger, so the list-page link and the page's aggregate branch agree in one place. (If a dedicated entry slug is preferred over reusing `network-checklist`, it is defined here and recognized in `InstallationPrereqPage`; the default keeps `network-checklist` to avoid changing the route contract in `App.tsx` and the existing tests.)

**No change** to:
- `frontend/src/App.tsx` route declarations (the `/prerequisites/installations/:installationId/:slug` shape is unchanged).
- `frontend/src/components/prerequisites/QuestionAnswerForm.tsx` (reused as-is, one instance per category).
- `frontend/src/components/prerequisites/configs.ts` (the four configs are reused as-is).
- `frontend/src/services/prerequisitesService.ts` (answer/static persistence unchanged).
- `frontend/src/components/prerequisites/StaticContentPage.tsx`.

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bug on the unfixed code (only one category rendered for a default installation), then verify the fix renders all four categories and preserves static/unknown/auth/persistence behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing the fix. Confirm or refute the root cause (single-slug entry + one-config render). If refuted, re-hypothesize.

**Test Plan**: Render `InstallationPrereqPage` at the default-installation entry route for an authenticated member and assert the presence of all four category headings. Run against the UNFIXED code to observe that only "Network Checklist" is present and the other three headings are absent.

**Test Cases**:
1. **Network Checklist present**: Entry route renders the "Network Checklist" heading (passes on unfixed code).
2. **Core Control Plane missing**: Entry route does NOT render "Core Control Plane" (will fail after fix; demonstrates the bug on unfixed code).
3. **CloudStore missing**: Entry route does NOT render "CloudStore" (demonstrates the bug on unfixed code).
4. **VCF missing**: Entry route does NOT render "VCF" (demonstrates the bug on unfixed code).

**Expected Counterexamples**:
- Only the Network Checklist section renders on the default-installation entry view; Core Control Plane, CloudStore, and VCF headings are absent.
- Cause: the entry route resolves to the single `network-checklist` slug and `InstallationPrereqPage` renders one config.

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed view renders all four checklist categories.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  result := renderInstallationPrereq_fixed(input)
  ASSERT renderedCategories(result) = { "Network Checklist",
                                        "Core Control Plane",
                                        "CloudStore",
                                        "VCF" }
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed view produces the same result as the original.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT renderInstallationPrereq_original(input) = renderInstallationPrereq_fixed(input)
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many inputs automatically across the slug domain (static slugs, question slugs, unknown slugs).
- It catches edge cases manual unit tests might miss (e.g. empty/undefined slug, unrecognized slug).
- It provides strong guarantees that non-entry behavior is unchanged for all non-buggy inputs.

The existing property-based route/guard suite in `frontend/src/pages/prerequisitesRoutes.test.tsx` already quantifies over the full set of prerequisites routes for both authenticated and unauthenticated access. It is the anchor for auth-guard preservation (Req 3.3) and per-route rendering.

**Test Plan**: Observe behavior on the UNFIXED code for static slugs, unknown slugs, unauthenticated access, and single-slug answer persistence, then assert the fixed code matches.

**Test Cases**:
1. **Static content preservation**: `basics` and `network-flux` still render a single `StaticContentPage` with the correct title (Req 3.1).
2. **Unknown-slug preservation**: an unrecognized slug still renders "Page de prérequis introuvable." (Req 3.2).
3. **Auth-guard preservation**: unauthenticated access to any prerequisites route still redirects to `/login` (Req 3.3) — covered by the existing property suite.
4. **Answer persistence preservation**: editing a client answer on any single category still calls `prerequisitesService.saveClientAnswer(installationId, slug, rowId, value)` with the same `(installationId, slug)` keys, and previously saved answers still load per category (Req 3.4).
5. **Per-row markers/examples/hints preservation**: each rendered category still shows mandatory/optional markers, example values, comments hints, and role-based read-only vs editable answer inputs (Req 3.5).

### Unit Tests

- Default-installation entry view renders all four category headings (Network Checklist, Core Control Plane, CloudStore, VCF) for an authenticated member.
- Each of the four categories renders its own section content (a representative question row per category).
- `basics` / `network-flux` render the single static content page unchanged.
- Unknown slug renders the not-found message.
- Editing an answer within one category on the aggregate view calls `saveClientAnswer` with that category's slug (not a shared/aggregate slug), confirming persistence keys are unchanged.
- Direct navigation to a single question slug (e.g. `/…/vcf`) still renders just that one category.

### Property-Based Tests

- Quantify over all prerequisites routes and assert authenticated access renders the matching page while unauthenticated access redirects to `/login` (existing suite in `prerequisitesRoutes.test.tsx`, preserved).
- Quantify over slugs and assert the not-found message renders for any slug outside the recognized set (unknown-slug preservation).
- Generate arbitrary `(rowId, value)` inputs for a randomly chosen category on the aggregate view and assert `saveClientAnswer` is invoked with that category's slug and the given `rowId`/`value` (persistence-key preservation).

### Integration Tests

- Full flow: from `InstallationListPage`, click an installation row and land on the aggregate view showing all four categories in order.
- Enter answers across two different categories on the aggregate view and confirm each persists under its own slug and reloads correctly on remount.
- Switch to a static slug and back, confirming static content and the not-found path behave unchanged.

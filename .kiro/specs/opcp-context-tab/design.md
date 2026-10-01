# Design Document

## Overview

This feature introduces an **OPCP Context** tab as the first entry of the prerequisites checklist. Unlike the existing question/answer tabs (Network Checklist, Core Control Plane, CloudStore, VCF) and the reference `servers` tab, the context tab renders a labeled key/value information form grouped into **sections** and, for the Contacts group, **nested subsections**. Values are seeded with defaults, persisted per installation through the existing `prerequisitesService`, editable only by administrators, and participate in export/import and the generated architecture document.

The design adds:

1. A new `context` member to the `ChecklistTab` discriminated union plus a render branch in `ChecklistTabs.tsx` (Requirements 1.2, 1.4).
2. New config types (`ContextConfig`, `ContextSection`, `ContextSubSection`, `ContextRow`) in `types.ts` and the concrete `opcpContextConfig` data in `configs.ts` (Requirements 2.x, 3.x).
3. Registration as the first entry of `CHECKLIST_CATEGORIES` plus an explicit export so export/import/arch-doc code can include the context tab even though it is excluded from `QA_CATEGORIES` (Requirements 1.1, 1.3, 8.4).
4. A new `ContextForm` component modeled on `QuestionAnswerForm`, with admin-vs-non-admin gating via `authService.isAdmin()` (Requirements 2.x, 3.x, 4.x, 5.x).
5. Export/import + architecture-document support in `installationExport.ts` (Requirements 6.x, 7.x).

The scope is strictly limited to the frontend. No backend changes are introduced; persistence reuses `prerequisitesService.loadClientAnswers` / `saveClientAnswer` with a new slug `opcp-context` (Requirements 4.2, 6.1).

### Non-goals (Requirement 8)

- The `isAuthenticated()`-based gating on `qa` and `servers` tabs is left untouched (8.1).
- The servers section rendering in the architecture document is left unchanged (8.3).
- The existing relative order of the four QA tabs and the servers tab is preserved; the context tab is only inserted ahead of them (8.4).

## Architecture

```
                         CHECKLIST_CATEGORIES (checklistCategories.ts)
                         [ context, network, core, cloudstore, vcf, servers ]
                                 │                                   │
                 ┌───────────────┘                                   └────────────────┐
                 ▼                                                                     ▼
         ChecklistTabs.tsx                                             installationExport.ts
         ├─ kind 'servers'  → ServersTable                            ├─ build/export JSON (QA + context + servers)
         ├─ kind 'context'  → ContextForm  ◄── NEW branch             ├─ import (QA + context; skip unknown ids)
         └─ default 'qa'    → QuestionAnswerForm                      ├─ clearInstallationValues (QA + context)
                 │                                                    └─ buildArchitectureDocumentHtml (QA + context + servers)
                 ▼
         ContextForm.tsx (NEW)
         ├─ loadClientAnswers(installationId, 'opcp-context')  → fall back to row.defaultValue
         ├─ authService.isAdmin()  → editable vs read-only+disabled
         └─ saveClientAnswer(installationId, 'opcp-context', rowId, value)  [admin only]
```

Two shared constants in `checklistCategories.ts` govern iteration:

- `QA_CATEGORIES` — filters out `kind: 'servers'`. The new `kind: 'context'` entry is **also** excluded from `QA_CATEGORIES` (its config shape is not a `QuestionFormConfig`), so any code that previously iterated `QA_CATEGORIES` to touch answer-backed tabs must now **explicitly** include the context tab.
- A new `CONTEXT_CATEGORY` export (a typed getter/narrowed reference to the single context entry) is added so `installationExport.ts` can include it without string-matching the slug.

### Why `context` is excluded from `QA_CATEGORIES`

`QA_CATEGORIES` is typed as `Extract<ChecklistTab, { config: unknown }>` and consumed as `QuestionFormConfig` throughout `installationExport.ts` (`category.config as QuestionFormConfig`). A context tab carries a `ContextConfig`, whose rows have `{ id, label, defaultValue }` — not the `{ id, questionPrimary, mandatory }` shape of `QuestionRow`. Letting it leak into `QA_CATEGORIES` would make those casts unsound. Keeping it out and iterating it explicitly preserves type safety and keeps the servers/QA rendering unchanged (Requirement 8.3).

## Data Model and Types

New types in `components/prerequisites/types.ts`, placed alongside the existing `ParameterRow`/`SubSection` (which are retained unchanged for `TrackingForm`). The existing `SubSection`/`ParameterRow` do **not** nest, which is why a dedicated nested shape is introduced for the Contacts group (Requirement 2.3, 2.4, 2.6).

```typescript
// A single labeled key/value entry. `id` is stable and unique page-wide
// (it is the persistence rowId). `defaultValue` seeds the field when no
// saved value exists for the installation.
export interface ContextRow {
  id: string;          // stable, unique within the context page (the rowId)
  label: string;       // French label shown to the user
  defaultValue: string; // seeded value; '' means "empty default"
}

// A nested subsection (used by the Contacts section). Mirrors the shape of a
// section minus further nesting — subsections do not nest further.
export interface ContextSubSection {
  id: string;
  title: string;       // French subsection heading
  rows: ContextRow[];
}

// An ordered section. A section carries either direct rows, nested
// subsections, or both. Rendering order is: section rows first (if any),
// then each subsection with its heading above its rows.
export interface ContextSection {
  id: string;
  title: string;       // French section heading
  rows?: ContextRow[];
  subsections?: ContextSubSection[];
}

// The configuration shape for the OPCP Context tab.
export interface ContextConfig {
  sections: ContextSection[];
}
```

Notes:
- `defaultValue` is **required and non-optional** on `ContextRow` (unlike `ParameterRow.defaultValue`) so that "display the default when unset" is total — every row has a well-defined seed, with `''` modeling the empty defaults in Requirement 3.3/3.5 (Site 2, wish date, MDC MAROC contact fields).
- Row ids are stable and unique across the entire context page, since the persistence store is keyed by `(installationId, slug, rowId)` and a duplicate id would collide across sections/subsections.

### Tab union extension (`ChecklistTabs.tsx`)

```typescript
export type ChecklistTab =
  | { kind?: 'qa'; slug: string; title: string; config: QuestionFormConfig }
  | { kind: 'servers'; slug: string; title: string }
  | { kind: 'context'; slug: string; title: string; config: ContextConfig }; // NEW
```

### `opcpContextConfig` data (`configs.ts`)

Slug `opcp-context`, title `OPCP Context`. Seeds come directly from Requirement 3. Row ids are stable, unique page-wide.

| Section | Subsection | Row id | Label | Default (Req) |
| --- | --- | --- | --- | --- |
| Client Environnement | — | `ctx-env-client-name` | Nom du client | `MDC MAROC` (3.3) |
| | — | `ctx-env-deployment-type` | Type de deploiement | `NanoPod` (3.3) |
| | — | `ctx-env-site1-location` | Site 1 Location | `« Demo » MDC Rabat` (3.3) |
| | — | `ctx-env-site2-location` | Site 2 Location | `` (3.3) |
| | — | `ctx-env-install-wish-date` | Installation wish date | `` (3.3) |
| | — | `ctx-env-managed-airgapped` | Managed / Air-gapped | `Managed` (3.3) |
| Contacts | OVH PSMC Architecte | `ctx-contact-ovh-name` | Nom | `Samuel LEPETRE` (3.4) |
| | | `ctx-contact-ovh-phone` | Téléphone | `` (3.4) |
| | | `ctx-contact-ovh-email` | Email | `samuel.lepetre@ovhcloud.com` (3.4) |
| | Client : MDC MAROC | `ctx-contact-client-name` | Nom | `` (3.5) |
| | | `ctx-contact-client-phone` | Téléphone | `` (3.5) |
| | | `ctx-contact-client-email` | Email | `` (3.5) |
| Use cases (?) | — | `ctx-usecase-vcf` | VCF | `Within Scope` (3.6) |
| | — | `ctx-usecase-suse-harvester` | SUSE Harvester | `Out of Scope` (3.6) |
| | — | `ctx-usecase-nutanix` | Nutanix | `Out of Scope` (3.6) |
| | — | `ctx-usecase-ia` | IA | `Out of Scope` (3.6) |
| | — | `ctx-usecase-kubernetes` | Kubernetes | `Out of Scope` (3.6) |

The Contacts section uses `subsections` (no direct `rows`); Client Environnement and Use cases use direct `rows` (no `subsections`). This satisfies Requirement 2.2–2.6.

### Registration (`checklistCategories.ts`)

```typescript
import { opcpContextConfig } from './configs';

export const CONTEXT_SLUG = 'opcp-context';

export const CHECKLIST_CATEGORIES: ReadonlyArray<ChecklistTab> = [
  { kind: 'context', slug: CONTEXT_SLUG, title: 'OPCP Context', config: opcpContextConfig }, // FIRST (Req 1.1)
  { slug: 'network-checklist', title: 'Network Checklist', config: networkChecklistConfig },
  { slug: 'core-control-plane', title: 'Core Control Plane', config: coreControlPlaneConfig },
  { slug: 'cloudstore', title: 'CloudStore', config: cloudStoreQuestionConfig },
  { slug: 'vcf', title: 'VCF', config: vcfConfig },
  { kind: 'servers', slug: SERVERS_NODES_SLUG, title: 'Servers nodes' },
];

// QA_CATEGORIES already filters kind:'servers'; it now also excludes kind:'context'
// because its config is a ContextConfig, not a QuestionFormConfig.
export const QA_CATEGORIES = CHECKLIST_CATEGORIES.filter(
  (c): c is Extract<ChecklistTab, { kind?: 'qa'; config: QuestionFormConfig }> =>
    c.kind !== 'servers' && c.kind !== 'context',
);

// Explicit, type-narrowed handle to the single context tab so export/import/
// arch-doc code can include it without string-matching the slug.
export const CONTEXT_CATEGORY = CHECKLIST_CATEGORIES.find(
  (c): c is Extract<ChecklistTab, { kind: 'context' }> => c.kind === 'context',
)!;
```

The `QA_CATEGORIES` predicate is tightened to exclude both `servers` and `context`, keeping its element type a true `QuestionFormConfig` carrier so the existing `as QuestionFormConfig` casts in `installationExport.ts` stay sound (Requirement 8.3).

## Component Responsibilities

### `ChecklistTabs.tsx`

Add a render branch so a `kind: 'context'` tab renders `ContextForm` with the `embedded` variant; all other branches are unchanged (Requirement 1.4, 8.1).

```typescript
{tab.kind === 'servers' ? (
  <ServersTable title={tab.title} variant="embedded" installationId={installationId} />
) : tab.kind === 'context' ? (
  <ContextForm
    installationId={installationId}
    slug={tab.slug}
    title={tab.title}
    config={tab.config}
    variant="embedded"
  />
) : (
  <QuestionAnswerForm
    installationId={installationId}
    slug={tab.slug}
    title={tab.title}
    config={tab.config}
    variant="embedded"
  />
)}
```

The tab-list rendering, ARIA roles, roving focus, and the "all panels stay mounted" behavior are untouched; the context tab appears first because it is first in `CHECKLIST_CATEGORIES` (Requirements 1.1, 1.3, 8.4).

### `ContextForm.tsx` (NEW)

Modeled on `QuestionAnswerForm.tsx`, reusing its `FIELD_CLASS` / `READONLY_FIELD_CLASS` styling, the `embedded` variant layout (drops the outer card and renders `<h2>`), the brand colors `#000E9C` / `#4949FF`, and French strings via `useTranslation` from `../../hooks/useLanguage`.

Props:

```typescript
interface ContextFormProps {
  installationId: string;
  slug: string;
  title: string;
  config: ContextConfig;
  variant?: 'card' | 'embedded';
}
```

Responsibilities:

- **Load (Requirement 3.1, 3.2):** On mount (and when `installationId`/`slug` change), call `prerequisitesService.loadClientAnswers(installationId, slug)` into an `answers: Record<string, string>` state. A cancellation guard (mirroring `QuestionAnswerForm`) prevents setting state after unmount. A failed load sets a `loadError` flag and surfaces a dismissible alert, same pattern as `QuestionAnswerForm`.
- **Resolve display value (Requirement 3.1, 3.2):** For each row, the input value is `answers[row.id] ?? row.defaultValue`. Because an unset row has no key in `answers`, it falls back to `defaultValue`; a saved value (including an empty string explicitly saved) takes precedence.
- **Role gating (Requirements 4.1, 5.1, 5.4):** Compute `const canEdit = authService.isAdmin();` once per render. When `canEdit` is true, inputs use `FIELD_CLASS` and are editable; otherwise they are `readOnly` + `disabled` and use `READONLY_FIELD_CLASS`. This is the **only** tab whose gating uses `isAdmin()` (Requirement 8.2).
- **Edit + persist (Requirements 4.2, 4.4, 5.3):** `onChange` updates local `answers` state so typing is preserved. Persistence fires on commit (`onBlur`) and **only when `canEdit`**, calling `prerequisitesService.saveClientAnswer(installationId, slug, rowId, value)`. Rows that are never edited are never written, so they remain default-seeded with no stored value (4.4). Non-admins cannot edit (inputs disabled) and the handler short-circuits on `!canEdit`, so `saveClientAnswer` is never called for them (5.3). A per-row save failure records a `errorRowIds` entry and shows an inline retry message, mirroring `QuestionAnswerForm`.
- **Render structure (Requirements 2.1, 2.6, 2.7, 2.8):** Iterate `config.sections` in order (2.1). For each section render its `<h2>` heading, then its direct `rows` (if any), then each `subsection` with its heading rendered **above** that subsection's rows (2.6). Every row renders a `<label>` (the French `row.label`) paired with a single free-text `<input type="text">` whose `id`/`htmlFor` associate them for accessibility (2.7). Each input has an `aria-label` incorporating the label text. Labels are the French literals from the config, consistent with the i18n approach used across the prerequisites UI (2.8).

```typescript
const resolveValue = (row: ContextRow) => answers[row.id] ?? row.defaultValue;

const commit = (rowId: string, value: string) => {
  if (!canEdit) return;              // Req 5.3
  void saveContextValue(rowId, value); // Req 4.2 — saveClientAnswer(installationId, slug, rowId, value)
};
```

The form does not render the Mandatory/Optional marker legend (that is specific to the QA archetype); it only renders labeled key/value inputs grouped by section/subsection.

## Persistence and Role-Gating Flow

```
Mount ContextForm
  └─ loadClientAnswers(installationId, 'opcp-context') → answers map
         (failure → loadError alert; answers = {})

Render each row:
  value = answers[row.id] ?? row.defaultValue        (Req 3.1/3.2)
  editable = authService.isAdmin()                   (Req 4.1/5.1/5.4)

Admin edits row:
  onChange → setAnswers({...answers, [rowId]: value})
  onBlur   → if (isAdmin) saveClientAnswer(installationId, 'opcp-context', rowId, value)   (Req 4.2)

Non-admin:
  inputs readOnly + disabled (READONLY_FIELD_CLASS); no save path invoked   (Req 5.1/5.2/5.3)
```

Persistence reuses the existing flat `rowId → value` store keyed by `(installationId, slug, rowId)`; no backend change is required (Requirements 4.2, 4.3).

## Export / Import / Architecture-Document Changes (`installationExport.ts`)

The context tab is answer-backed like the QA tabs but is not in `QA_CATEGORIES`, so each of the four touch-points explicitly includes `CONTEXT_CATEGORY`.

### Export (Requirement 6.1)

In `buildInstallationExport`, after loading the QA tabs, also load the context tab's answers and write them into `tabs[CONTEXT_CATEGORY.slug]`:

```typescript
try {
  const r = await prerequisitesService.loadClientAnswers(installation.id, CONTEXT_CATEGORY.slug);
  tabs[CONTEXT_CATEGORY.slug] = r.answers ?? {};
} catch {
  tabs[CONTEXT_CATEGORY.slug] = {};
}
```

The export JSON `tabs` map is unchanged in shape (`slug -> { rowId -> value }`); the context slug is simply an additional key.

### Import (Requirements 6.2, 6.3, 6.4)

Extend the valid-row-id map build to include the context tab, flattening its sections **and** subsections into one id set:

```typescript
const contextIds = new Set<string>();
for (const section of (CONTEXT_CATEGORY.config as ContextConfig).sections) {
  for (const row of section.rows ?? []) contextIds.add(row.id);
  for (const sub of section.subsections ?? []) for (const row of sub.rows) contextIds.add(row.id);
}
validRowIdsBySlug.set(CONTEXT_CATEGORY.slug, contextIds);
```

The existing import loop then handles the context slug uniformly: it writes values for ids present in `contextIds` and skips unknown ids (6.3). The servers slug skip is unchanged. Because export writes the same `slug -> {rowId -> value}` shape and import restores exactly the valid ids, an export-then-import reproduces the saved values (6.4).

### Clear (Requirement 6.5)

`clearInstallationValues` iterates `QA_CATEGORIES`; add an explicit pass over the context rows so every context row id is cleared to `''`:

```typescript
for (const section of (CONTEXT_CATEGORY.config as ContextConfig).sections) {
  const rows = [...(section.rows ?? []), ...(section.subsections ?? []).flatMap((s) => s.rows)];
  for (const row of rows) {
    try { await prerequisitesService.saveClientAnswer(installationId, CONTEXT_CATEGORY.slug, row.id, ''); cleared += 1; }
    catch { failed += 1; }
  }
}
```

### Architecture document (Requirements 7.1–7.4)

- **TOC (7.1):** `buildArchitectureDocumentHtml` already derives the TOC from `CHECKLIST_CATEGORIES`, so the `OPCP Context` title appears automatically once the tab is registered first. No TOC code change is required.
- **Section rendering (7.2, 7.3, 7.4):** Add a dedicated `renderContextSection(config, answers, labels)` that renders the context section grouped by section and subsection. Each row renders its label and a value cell resolving to `answers[row.id]` when present else `row.defaultValue` (7.3/7.4), reusing `escapeHtml`. The context section is rendered **before** the QA sections (to match the tab ordering) while the existing `renderQaSection` loop over `QA_CATEGORIES` and `renderServersSection` remain unchanged (8.3).

```typescript
const contextSection = renderContextSection(
  CONTEXT_CATEGORY.config as ContextConfig,
  data.tabs[CONTEXT_CATEGORY.slug] ?? {},
  labels,
);
// ... body: ${contextSection}${qaSections}${serversSection}
```

`renderContextSection` emits an `<h2>` with the tab title, then per section an `<h3>` heading, a two-column (label / value) table for direct rows, and for each subsection an `<h4>` heading above its own label/value table. Two new `DocLabels` entries (`contextParam`/`contextValue`) may be reused from the existing `paramQuestion`/`value` labels to avoid expanding the vocabulary unnecessarily.

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — a formal statement about what the system should do. Properties bridge human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Sections render in configured order

*For any* `ContextConfig`, when `ContextForm` renders, the section headings appear in the DOM in exactly the same order as `config.sections`.

**Validates: Requirements 2.1**

### Property 2: Subsection heading precedes its rows

*For any* `ContextConfig` and any section that defines nested subsections, each subsection heading appears in the rendered output before the inputs for that subsection's rows.

**Validates: Requirements 2.6**

### Property 3: Every row yields one labeled free-text input

*For any* `ContextConfig`, for every row across all sections and subsections, `ContextForm` renders exactly one free-text input associated with that row's label (via `id`/`htmlFor`).

**Validates: Requirements 2.7, 2.8**

### Property 4: Unset rows display their default

*For any* `ContextConfig`, when `loadClientAnswers` returns no saved value for a row, that row's input displays the row's `defaultValue`.

**Validates: Requirements 3.1**

### Property 5: Saved values override defaults on display

*For any* `ContextConfig` and any map of saved `rowId → value`, each row whose id has a saved value displays that saved value, and every other row displays its `defaultValue`. This also holds across a reload for the same installation.

**Validates: Requirements 3.2, 4.3**

### Property 6: Admin inputs are editable, non-admin inputs are read-only

*For any* `ContextConfig`, when `authService.isAdmin()` is true every row input is editable and uses `FIELD_CLASS`; when `authService.isAdmin()` is false every row input is `readOnly`, `disabled`, and uses `READONLY_FIELD_CLASS`.

**Validates: Requirements 4.1, 5.1, 5.2, 5.4**

### Property 7: Admin edits persist with the correct arguments

*For any* row and any value, when the current user is an administrator and that row is edited and committed, `prerequisitesService.saveClientAnswer` is called exactly once with `(installationId, slug, rowId, value)`.

**Validates: Requirements 4.2**

### Property 8: Unedited rows are never persisted

*For any* `ContextConfig`, if no row is edited, `saveClientAnswer` is never called, so unedited rows remain default-seeded without a stored value.

**Validates: Requirements 4.4**

### Property 9: Non-administrators never persist

*For any* `ContextConfig`, when the current user is not an administrator, no interaction results in a call to `saveClientAnswer`.

**Validates: Requirements 5.3**

### Property 10: Import skips unknown row ids

*For any* set of valid context row ids mixed with ids absent from the context config, importing restores values only for the valid context row ids and writes nothing for the unknown ids.

**Validates: Requirements 6.3**

### Property 11: Export then import reproduces context values

*For any* assignment of values to context rows, building the export JSON and then importing it writes back the identical `rowId → value` pairs for the context slug.

**Validates: Requirements 6.1, 6.2, 6.4**

### Property 12: Clear covers every context row

*For any* `ContextConfig`, `clearInstallationValues` writes an empty value for every context row id (across all sections and subsections).

**Validates: Requirements 6.5**

### Property 13: Architecture document renders every context row grouped

*For any* `ContextConfig`, the architecture-document HTML contains every section heading, every subsection heading, and every row label, grouped under their respective sections and subsections.

**Validates: Requirements 7.2**

### Property 14: Architecture document value resolution

*For any* `ContextConfig` and any map of saved `rowId → value`, each context row's value cell in the architecture document shows the saved value when one exists for the installation and otherwise shows the row's `defaultValue`.

**Validates: Requirements 7.3, 7.4**

## Testing Strategy

Testing combines example-based unit tests (for fixed config facts and ordering) and property-based tests (for input-varying behavior). Property tests run a minimum of 100 iterations and are tagged `Feature: opcp-context-tab, Property {n}: {property text}`. The project uses Vitest + Testing Library (frontend) and `fast-check` for property-based tests; run frontend tests with `vitest --run` (single execution, not watch mode).

### `ContextForm.test.tsx` (NEW)

- **Default seeding (example, Req 3.3–3.6):** Render `ContextForm` with `opcpContextConfig` and `loadClientAnswers` mocked to `{}`; assert each named row shows its exact seeded default (e.g. Nom du client = `MDC MAROC`, Type de deploiement = `NanoPod`, VCF = `Within Scope`, Email OVH = `samuel.lepetre@ovhcloud.com`, empty-default rows show `''`).
- **Section/subsection labels present (example, Req 2.2–2.5, 2.8):** Assert the three section headings, both Contacts subsection headings, and every row label are rendered with their French labels.
- **Admin editable vs non-admin read-only (Property 6, Req 4.1/5.1/5.2/5.4):** Property test over generated configs with `authService.isAdmin()` mocked true/false; assert editable/`FIELD_CLASS` vs `disabled`+`readOnly`/`READONLY_FIELD_CLASS` for every input.
- **Save-on-edit (Property 7, Req 4.2):** Property test — as admin, edit a random row to a random value, blur, and assert `saveClientAnswer` called once with `(installationId, 'opcp-context', rowId, value)`.
- **No save when unedited (Property 8, Req 4.4) and non-admin no save (Property 9, Req 5.3):** Assert `saveClientAnswer` is not called when nothing is edited, and never called when `isAdmin()` is false.
- **Default vs saved display (Properties 4 & 5, Req 3.1/3.2/4.3):** Property test — mock `loadClientAnswers` to return a random subset of saved values; assert each input shows the saved value where present and `defaultValue` otherwise.
- **Structural ordering (Properties 1–3, Req 2.1/2.6/2.7):** Property tests over generated `ContextConfig`s asserting section order, subsection-heading-before-rows, and one labeled input per row.

### `checklistCategories.test.ts` (NEW or extended)

- **Ordering (examples, Req 1.1/1.3/8.4):** Assert `CHECKLIST_CATEGORIES[0]` has `kind: 'context'`, `slug: 'opcp-context'`, `title: 'OPCP Context'`, and that the full slug sequence is `['opcp-context','network-checklist','core-control-plane','cloudstore','vcf','servers-nodes']`.
- **`QA_CATEGORIES` exclusion:** Assert `QA_CATEGORIES` contains neither the context nor the servers slug and that `CONTEXT_CATEGORY.slug === 'opcp-context'`.

### `ChecklistTabs` render test (extended)

- **Branch selection (examples, Req 1.4):** Render `ChecklistTabs` with `CHECKLIST_CATEGORIES`; assert the first tab button is `OPCP Context` and, when active, a `ContextForm`-specific element (a context row label/input) is present rather than a QA marker legend.

### `installationExport.test.ts` (extended)

- **Export includes context key (example, Req 6.1):** Build an export; assert `tabs['opcp-context']` exists and reflects loaded context answers.
- **Round-trip (Property 11, Req 6.1/6.2/6.4):** Property test over random context row-value maps; export then import and assert the exact `(rowId → value)` pairs are written via `saveClientAnswer` for the context slug.
- **Import skips unknown ids (Property 10, Req 6.3):** Property test with valid+invalid ids; assert only valid context ids are written.
- **Clear covers context (Property 12, Req 6.5):** Assert `clearInstallationValues` writes `''` for every context row id (count equals QA rows + all context rows).
- **Arch-doc TOC + grouping (Property 13 + example, Req 7.1/7.2):** Assert the generated HTML TOC contains `OPCP Context` and the document contains every context section heading, subsection heading, and row label.
- **Arch-doc value resolution (Property 14, Req 7.3/7.4):** Property test — with random saved values, assert each context value cell shows the saved value when present else the `defaultValue`.
- **Regression (examples, Req 8.3):** Existing servers-section and QA-section assertions remain green, confirming the servers rendering and QA iteration are unchanged.

### Non-regression (Requirement 8.1)

Existing `QuestionAnswerForm` tests remain unchanged and green, confirming `qa` tabs still gate editing on `isAuthenticated()` and that the context tab is the only tab gating on `isAdmin()` (8.2).

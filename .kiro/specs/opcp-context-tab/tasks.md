# Implementation Plan: OPCP Context Tab

## Overview

Add an "OPCP Context" tab as the first entry of the prerequisites checklist. The tab renders a labeled key/value information form grouped into sections and nested subsections (Contacts), seeded with defaults, persisted per installation through the existing `prerequisitesService`, editable only by administrators, and wired into export/import and the generated architecture document.

The plan builds bottom-up: types → config data → tab union → category registration → the `ContextForm` component → the render branch → export/import/arch-doc wiring → a final build + full-suite verification. Each step compiles and is testable on its own and feeds the next, with no orphaned code.

Testing notes:
- Frontend tests run with `vitest --run` (single execution, not watch mode).
- Property-based tests use `fast-check` (minimum 100 iterations) and are tagged `Feature: opcp-context-tab, Property {n}: {property text}`.
- Tests use Vitest + Testing Library.

## Tasks

- [x] 1. Add context config types
  - Add `ContextRow` (`id`, `label`, non-optional `defaultValue`), `ContextSubSection` (`id`, `title`, `rows`), `ContextSection` (`id`, `title`, optional `rows`, optional `subsections`), and `ContextConfig` (`sections`) to `frontend/src/components/prerequisites/types.ts`.
  - Keep existing `ParameterRow`/`SubSection` unchanged (still used by `TrackingForm`).
  - _Requirements: 2.1, 2.6, 2.7, 3.1_

- [x] 2. Add `opcpContextConfig` data
  - [x] 2.1 Define `opcpContextConfig: ContextConfig` in `frontend/src/components/prerequisites/configs.ts` with all sections, subsections, rows, stable page-wide-unique row ids, French labels, and seeded defaults exactly per the design data table (Client Environnement direct rows; Contacts with two subsections and no direct rows; Use cases direct rows).
    - _Requirements: 2.2, 2.3, 2.4, 2.5, 3.3, 3.4, 3.5, 3.6_

- [x] 3. Extend the `ChecklistTab` union with `context`
  - Add the `{ kind: 'context'; slug: string; title: string; config: ContextConfig }` member to the `ChecklistTab` discriminated union in `frontend/src/components/prerequisites/ChecklistTabs.tsx`, importing `ContextConfig` from `types.ts`.
  - _Requirements: 1.2_

- [x] 4. Register the context tab and category exports
  - [x] 4.1 In `frontend/src/components/prerequisites/checklistCategories.ts`, add `CONTEXT_SLUG = 'opcp-context'`, register `{ kind: 'context', slug: CONTEXT_SLUG, title: 'OPCP Context', config: opcpContextConfig }` as the FIRST entry of `CHECKLIST_CATEGORIES` (before network/core/cloudstore/vcf/servers), tighten the `QA_CATEGORIES` predicate to exclude both `kind: 'servers'` and `kind: 'context'`, and add the type-narrowed `CONTEXT_CATEGORY` export.
    - _Requirements: 1.1, 1.3, 8.4_

  - [ ]* 4.2 Add/extend `checklistCategories.test.ts`
    - Assert `CHECKLIST_CATEGORIES[0]` has `kind: 'context'`, `slug: 'opcp-context'`, `title: 'OPCP Context'`.
    - Assert the full slug sequence is `['opcp-context','network-checklist','core-control-plane','cloudstore','vcf','servers-nodes']`, preserving the existing relative order.
    - Assert `QA_CATEGORIES` contains neither the context nor the servers slug and `CONTEXT_CATEGORY.slug === 'opcp-context'`.
    - _Requirements: 1.1, 1.3, 8.4_

- [x] 5. Create the `ContextForm` component
  - [x] 5.1 Create `frontend/src/components/prerequisites/ContextForm.tsx` modeled on `QuestionAnswerForm`
    - Props: `installationId`, `slug`, `title`, `config`, optional `variant` (`'card' | 'embedded'`).
    - Load via `prerequisitesService.loadClientAnswers(installationId, slug)` into an `answers` map with an unmount cancellation guard and a dismissible `loadError` alert on failure.
    - Resolve each input value as `answers[row.id] ?? row.defaultValue`.
    - Compute `canEdit = authService.isAdmin()` once per render; editable + `FIELD_CLASS` when true, else `readOnly` + `disabled` + `READONLY_FIELD_CLASS`.
    - `onChange` updates local `answers`; `onBlur` commits via `prerequisitesService.saveClientAnswer(installationId, slug, rowId, value)` only when `canEdit`; short-circuit on `!canEdit`.
    - Render `config.sections` in order: section `<h2>`, then direct rows, then each subsection heading above its rows; every row is a `<label>` + free-text `<input>` associated by `id`/`htmlFor` with an `aria-label`. French labels via `useTranslation`. Support the `embedded` variant layout (no outer card, `<h2>` heading). Reuse brand colors `#000E9C` / `#4949FF`.
    - _Requirements: 2.1, 2.6, 2.7, 2.8, 3.1, 3.2, 4.1, 4.2, 4.3, 4.4, 5.1, 5.2, 5.3, 5.4_

  - [ ]* 5.2 `ContextForm.test.tsx` — default seeding and labels (examples)
    - With `loadClientAnswers` mocked to `{}`, assert each named row shows its exact seeded default (e.g. Nom du client = `MDC MAROC`, Type de deploiement = `NanoPod`, VCF = `Within Scope`, Email OVH = `samuel.lepetre@ovhcloud.com`, empty-default rows show `''`).
    - Assert the three section headings, both Contacts subsection headings, and every row label render with their French labels.
    - _Requirements: 2.2, 2.3, 2.4, 2.5, 2.8, 3.3, 3.4, 3.5, 3.6_

  - [ ]* 5.3 `ContextForm.test.tsx` — structural ordering property tests (fast-check)
    - **Property 1: Sections render in configured order** — section headings appear in DOM in `config.sections` order. **Validates: Requirements 2.1**
    - **Property 2: Subsection heading precedes its rows** — each subsection heading appears before its rows' inputs. **Validates: Requirements 2.6**
    - **Property 3: Every row yields one labeled free-text input** — exactly one free-text input per row, associated via `id`/`htmlFor`. **Validates: Requirements 2.7, 2.8**
    - _Requirements: 2.1, 2.6, 2.7, 2.8_

  - [ ]* 5.4 `ContextForm.test.tsx` — display value property tests (fast-check)
    - **Property 4: Unset rows display their default** — when `loadClientAnswers` returns no saved value for a row, the input shows `defaultValue`. **Validates: Requirements 3.1**
    - **Property 5: Saved values override defaults on display** — with a random subset of saved `rowId → value`, each saved row shows its value and all others show `defaultValue`, including across reload. **Validates: Requirements 3.2, 4.3**
    - _Requirements: 3.1, 3.2, 4.3_

  - [ ]* 5.5 `ContextForm.test.tsx` — role gating and persistence property tests (fast-check)
    - **Property 6: Admin inputs editable, non-admin read-only** — with `authService.isAdmin()` true, every input is editable with `FIELD_CLASS`; false → `readOnly` + `disabled` + `READONLY_FIELD_CLASS`. **Validates: Requirements 4.1, 5.1, 5.2, 5.4**
    - **Property 7: Admin edits persist with correct arguments** — as admin, edit a random row to a random value and blur; assert `saveClientAnswer` called once with `(installationId, 'opcp-context', rowId, value)`. **Validates: Requirements 4.2**
    - **Property 8: Unedited rows are never persisted** — if nothing is edited, `saveClientAnswer` is never called. **Validates: Requirements 4.4**
    - **Property 9: Non-administrators never persist** — when `isAdmin()` is false, no interaction calls `saveClientAnswer`. **Validates: Requirements 5.3**
    - _Requirements: 4.1, 4.2, 4.4, 5.1, 5.2, 5.3, 5.4_

- [x] 6. Checkpoint — ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Add the `context` render branch
  - [x] 7.1 In `frontend/src/components/prerequisites/ChecklistTabs.tsx`, add the `tab.kind === 'context'` branch rendering `ContextForm` with the `embedded` variant and the tab's `installationId`, `slug`, `title`, `config`; leave the `servers` and default `qa` branches and all tab-list/ARIA/focus/mount behavior unchanged.
    - _Requirements: 1.4, 8.1_

  - [ ]* 7.2 Extend the `ChecklistTabs` render test
    - Render with `CHECKLIST_CATEGORIES`; assert the first tab button is `OPCP Context` and, when active, a `ContextForm`-specific element (a context row label/input) is present rather than the QA marker legend.
    - _Requirements: 1.4_

- [x] 8. Export / import / clear / architecture-document wiring
  - [x] 8.1 Export + import + clear in `frontend/src/services/installationExport.ts`
    - Export: in `buildInstallationExport`, load `CONTEXT_CATEGORY.slug` answers and write `tabs[CONTEXT_CATEGORY.slug] = r.answers ?? {}` (empty object on failure).
    - Import: build a `contextIds` set by flattening the context config across sections and subsections and add it to `validRowIdsBySlug` so the existing import loop restores valid ids and skips unknown ids.
    - Clear: in `clearInstallationValues`, add an explicit pass writing `''` for every context row id across all sections and subsections, counting cleared/failed.
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

  - [x] 8.2 Architecture-document rendering in `frontend/src/services/installationExport.ts`
    - Add `renderContextSection(config, answers, labels)` emitting an `<h2>` title, per-section `<h3>` heading with a label/value table for direct rows, and per-subsection `<h4>` heading above its own label/value table; each value cell resolves to `answers[row.id] ?? row.defaultValue` using `escapeHtml`.
    - In `buildArchitectureDocumentHtml`, render the context section before the QA sections (`${contextSection}${qaSections}${serversSection}`); TOC derives from `CHECKLIST_CATEGORIES` automatically, and the servers/QA rendering stays unchanged.
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 8.3_

  - [ ]* 8.3 Extend `installationExport.test.ts` — export/import/clear
    - Export includes context key (example): `tabs['opcp-context']` exists and reflects loaded context answers. _Req 6.1_
    - **Property 10: Import skips unknown row ids** — with valid + invalid ids, only valid context ids are written. **Validates: Requirements 6.3**
    - **Property 11: Export then import reproduces context values** — over random context row-value maps, export then import writes the exact `(rowId → value)` pairs for the context slug. **Validates: Requirements 6.1, 6.2, 6.4**
    - **Property 12: Clear covers every context row** — `clearInstallationValues` writes `''` for every context row id (count equals QA rows + all context rows). **Validates: Requirements 6.5**
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

  - [ ]* 8.4 Extend `installationExport.test.ts` — architecture document
    - Arch-doc TOC + grouping (example + **Property 13: Architecture document renders every context row grouped**) — generated HTML TOC contains `OPCP Context`; document contains every context section heading, subsection heading, and row label grouped under their sections/subsections. **Validates: Requirements 7.2**
    - **Property 14: Architecture document value resolution** — with random saved values, each context value cell shows the saved value when present else `defaultValue`. **Validates: Requirements 7.3, 7.4**
    - Regression (examples): existing servers-section and QA-section assertions remain green, confirming servers rendering and QA iteration are unchanged. _Req 8.3_
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 8.3_

- [x] 9. Final verification
  - Run the frontend build/typecheck and the full frontend test suite with `vitest --run`; fix any type errors or test failures until the build is clean and all tests pass.
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.x, 3.x, 4.x, 5.x, 6.x, 7.x, 8.x_

## Notes

- Tasks marked with `*` are optional test sub-tasks and can be skipped for a faster MVP; core implementation sub-tasks are never optional.
- Each task references specific requirement clauses for traceability; property tests additionally reference the design's numbered properties.
- Checkpoints ensure incremental validation.
- Property tests use `fast-check` (≥100 iterations); unit/example tests cover fixed config facts and ordering.
- Scope is frontend-only; persistence reuses `prerequisitesService` with the new `opcp-context` slug — no backend changes.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1"] },
    { "id": 1, "tasks": ["2.1", "3"] },
    { "id": 2, "tasks": ["4.1"] },
    { "id": 3, "tasks": ["4.2", "5.1"] },
    { "id": 4, "tasks": ["5.2", "5.3", "5.4", "5.5", "7.1"] },
    { "id": 5, "tasks": ["7.2", "8.1"] },
    { "id": 6, "tasks": ["8.2"] },
    { "id": 7, "tasks": ["8.3", "8.4"] }
  ]
}
```

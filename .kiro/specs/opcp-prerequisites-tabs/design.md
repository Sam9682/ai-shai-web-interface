# Design Document

## Overview

This feature restructures the "OPCP installation prerequisites" navigation so that each source Excel workbook tab maps to a dedicated page under `/prerequisites/{slug}`. It replaces the previous three-entry, LandingZone-based menu with seven entries and three distinct page archetypes, and it moves persistence from browser `localStorage` to a shared server-side API.

The seven pages are:

| Label | Slug / Route | Archetype |
| --- | --- | --- |
| How to use | `/prerequisites/how-to-use` | How-to-use (static, read-only for everyone) |
| Basics | `/prerequisites/basics` | Static content (admin-editable) |
| Network Checklist | `/prerequisites/network-checklist` | Question/answer |
| Core Control Plane | `/prerequisites/core-control-plane` | Question/answer (formerly "OPCP Core") |
| CloudStore | `/prerequisites/cloudstore` | Question/answer |
| VCF | `/prerequisites/vcf` | Question/answer |
| Network Flux | `/prerequisites/network-flux` | Static content (admin-editable) |

Three behavioral archetypes:

1. **How-to-use** — a single static, read-only informational page (legend, tips, examples, secrets warning). No persistence.
2. **Static content** (Basics, Network Flux) — server-persisted rich content, editable only by an `Admin_User`, read-only for a `Member_User`.
3. **Question/answer** (Network Checklist, Core Control Plane, CloudStore, VCF) — two read-only question columns plus an editable `Client_Answer` column for authenticated non-admin members, with Mandatory/Optional markers, example values, and Comments/Details hints. Answers persist server-side.

The language for all code examples is **TypeScript / React**, matching the existing `frontend/` codebase (Vite + React Router + Vitest + fast-check + axios).

## Architecture

### Layered view

```
Layout.tsx (nav)  ──renders──▶ PREREQ_NAV_ITEMS (types.ts)
        │
App.tsx (router)  ──registers──▶ /prerequisites/{slug}  ──guarded by──▶ ProtectedRoute
        │
        ├─ HowToUsePage            (static archetype 1)  ── no service calls
        ├─ StaticContentPage       (archetype 2)         ─┐
        └─ QuestionAnswerPage      (archetype 3)         ─┤
                                                          │
                            uses  authService.isAdmin()/isAuthenticated()
                                                          │
                            uses  prerequisitesService (frontend)
                                                          │
                            calls  api (axios) ──▶ Prerequisites_API (backend)
```

### Key decisions

- **Navigation is data-driven.** `PREREQ_NAV_ITEMS` in `types.ts` is the single source of truth consumed by both the desktop dropdown and the mobile menu in `Layout.tsx`. This preserves the existing pattern and keeps `Layout.prereq.test.tsx` structurally valid (only the entry set changes).
- **Routes derive from the same slugs.** `App.tsx` registers one `ProtectedRoute`-wrapped route per entry. The route path and the nav `route` share the same `/prerequisites/{slug}` string.
- **Persistence moves to a service.** The `usePersistentForm` `localStorage` hook is replaced, for the new pages, by a `prerequisitesService` that talks to the backend. `usePersistentForm` and the current `TrackingForm` remain in the tree until migration completes so their tests stay green (see Testing Strategy).
- **Role gating uses the existing `authService`.** `isAdmin()` gates static-content editing; `isAuthenticated()` + not-admin defines a `Member_User` who may edit `Client_Answer`. No new role is introduced.

## Components and Interfaces

### 1. Navigation config (`types.ts`)

`PREREQ_NAV_ITEMS` is rewritten to the seven entries. Kept as a `const` tuple so `item.label`/`item.route` typing continues to work in `Layout.tsx` and tests.

```ts
export interface PrereqNavItem {
  label: string;
  route: string;      // always `/prerequisites/${slug}`
  archetype: 'how-to-use' | 'static' | 'qa';
}

export const PREREQ_NAV_ITEMS: readonly PrereqNavItem[] = [
  { label: 'How to use',         route: '/prerequisites/how-to-use',        archetype: 'how-to-use' },
  { label: 'Basics',             route: '/prerequisites/basics',            archetype: 'static' },
  { label: 'Network Checklist',  route: '/prerequisites/network-checklist', archetype: 'qa' },
  { label: 'Core Control Plane', route: '/prerequisites/core-control-plane',archetype: 'qa' },
  { label: 'CloudStore',         route: '/prerequisites/cloudstore',        archetype: 'qa' },
  { label: 'VCF',                route: '/prerequisites/vcf',               archetype: 'qa' },
  { label: 'Network Flux',       route: '/prerequisites/network-flux',      archetype: 'static' },
] as const;
```

Notes:
- LandingZone is removed (Req 1.3). "OPCP Core" is renamed and re-slugged to Core Control Plane at `/prerequisites/core-control-plane` (Req 1.4).
- `archetype` lets `Layout.tsx` stay archetype-agnostic (it only reads `label`/`route`) while pages and tests can look up behavior if useful. `Layout.tsx` requires no logic change beyond the new entries flowing through the existing `.map(...)`.

### 2. Layout (`Layout.tsx`)

No structural change: the desktop dropdown and mobile section already iterate `PREREQ_NAV_ITEMS`. The seven new entries flow through unchanged. Auth-gating (menu only shown when authenticated) is unchanged and preserved by existing tests.

### 3. Router (`App.tsx`)

Replace the three current prerequisites routes with seven, each wrapped in `ProtectedRoute` (Req 2.1–2.4):

```tsx
<Route path="/prerequisites/how-to-use"        element={<ProtectedRoute><HowToUsePage /></ProtectedRoute>} />
<Route path="/prerequisites/basics"            element={<ProtectedRoute><BasicsPage /></ProtectedRoute>} />
<Route path="/prerequisites/network-checklist" element={<ProtectedRoute><NetworkChecklistPage /></ProtectedRoute>} />
<Route path="/prerequisites/core-control-plane"element={<ProtectedRoute><CoreControlPlanePage /></ProtectedRoute>} />
<Route path="/prerequisites/cloudstore"        element={<ProtectedRoute><CloudStorePage /></ProtectedRoute>} />
<Route path="/prerequisites/vcf"               element={<ProtectedRoute><VcfPage /></ProtectedRoute>} />
<Route path="/prerequisites/network-flux"      element={<ProtectedRoute><NetworkFluxPage /></ProtectedRoute>} />
```

The obsolete `OPCPCorePage` and `LandingZonePage` imports/routes are removed. `CloudStorePage` is retargeted to the new question/answer archetype.

### 4. Page components (`frontend/src/pages/`)

| File | Archetype | Renders |
| --- | --- | --- |
| `HowToUsePage.tsx` | how-to-use | `<HowToUse />` component (no props) |
| `BasicsPage.tsx` | static | `<StaticContentPage slug="basics" title="Basics" />` |
| `NetworkFluxPage.tsx` | static | `<StaticContentPage slug="network-flux" title="Network Flux" />` |
| `NetworkChecklistPage.tsx` | qa | `<QuestionAnswerForm slug="network-checklist" title="Network Checklist" config={networkChecklistConfig} />` |
| `CoreControlPlanePage.tsx` | qa | `<QuestionAnswerForm slug="core-control-plane" title="Core Control Plane" config={coreControlPlaneConfig} />` |
| `CloudStorePage.tsx` | qa | `<QuestionAnswerForm slug="cloudstore" title="CloudStore" config={cloudStoreConfig} />` |
| `VcfPage.tsx` | qa | `<QuestionAnswerForm slug="vcf" title="VCF" config={vcfConfig} />` |

Pages stay thin wrappers, mirroring the current `CloudStorePage` pattern.

### 5. Archetype 1 — `HowToUse` component (`frontend/src/components/prerequisites/HowToUse.tsx`)

A static, presentational component. No inputs, no persistence, identical for every role (Req 3.1).

Displays (Req 3.2–3.4):
- **Legend** describing Mandatory (e.g. `🔴 Obligatoire`) and Optional (e.g. `⚪ Optionnel`) markers. The marker legend is factored into a shared constant `PREREQ_MARKERS` in `types.ts` so the How-to-use legend and the per-row markers on question/answer pages stay consistent.
- **Completion tips and example guidance** (a short bulleted list).
- **Secrets warning** — a visually distinct callout instructing users not to enter secrets, PSK, or credentials on the page, and to provide such values through a secure channel instead.

```ts
export const PREREQ_MARKERS = {
  mandatory: { label: 'Obligatoire', icon: '🔴' },
  optional:  { label: 'Optionnel',  icon: '⚪' },
} as const;
```

### 6. Archetype 2 — `StaticContentPage` component (`frontend/src/components/prerequisites/StaticContentPage.tsx`)

Props: `{ slug: string; title: string }`.

Behavior:
- On mount, loads content via `prerequisitesService.loadStaticContent(slug)` (Req 6.2) and renders it for every authenticated user (Req 4.1).
- Computes `canEdit = authService.isAdmin()` (Req 4.5).
- If `canEdit`, shows an editor (reuse the existing `RichTextEditor`) plus a Save button; on save, calls `prerequisitesService.saveStaticContent(slug, content)` (Req 4.2, 4.4).
- If not, renders the content read-only with no edit controls (Req 4.3).
- On save failure, shows an error indication (Req 6.5).

```tsx
export const StaticContentPage = ({ slug, title }: { slug: string; title: string }) => {
  const canEdit = authService.isAdmin();
  const [content, setContent] = useState('');
  const [status, setStatus] = useState<'idle' | 'saving' | 'error'>('idle');

  useEffect(() => {
    prerequisitesService.loadStaticContent(slug)
      .then((r) => setContent(r.content))
      .catch(() => setStatus('error'));
  }, [slug]);

  const handleSave = async (next: string) => {
    setStatus('saving');
    try {
      await prerequisitesService.saveStaticContent(slug, next);
      setContent(next);
      setStatus('idle');
    } catch {
      setStatus('error'); // Req 6.5
    }
  };

  // canEdit ? <RichTextEditor value={content} onChange=… /> + Save
  //         : <div dangerouslySetInnerHTML={{ __html: content }} /> (read-only)
  // status === 'error' ? <ErrorBanner /> : null
};
```

### 7. Archetype 3 — `QuestionAnswerForm` component

**Decision: introduce a new `QuestionAnswerForm` component rather than extend `TrackingForm`.**

Reasoning:
- `TrackingForm` renders a fixed **four-editable-fields-per-row** model (Valeur / Statut / Date de réception / Commentaires), all editable, all wired to `usePersistentForm`/`localStorage`. Its shape and every one of its `TrackingForm.test.tsx` properties assume "each row renders all four fields." The new archetype is a different layout: **two read-only question columns + one editable Client answer column**, plus per-row marker/example/hints metadata. Overloading `TrackingForm` with a mode flag would fork its rendering and threaten the existing green property tests (Req 8.4).
- Keeping `TrackingForm` untouched is the lowest-risk way to satisfy Req 8.4 (its suite stays green as-is). `QuestionAnswerForm` is a sibling component in the same `prerequisites/` folder that reuses shared pieces: `FormConfig`/`SubSection` structure, the `PREREQ_MARKERS` legend, and the section-then-rows layout.
- Both components consume the same `FormConfig` type (extended below), so `configs.ts` remains the single config module (Req 7.4).

Props: `{ slug: string; title: string; config: FormConfig }`.

Behavior:
- Loads persisted answers on mount via `prerequisitesService.loadClientAnswers(slug)` (Req 6.2).
- Renders each section heading, then each row as: **Question column 1 (read-only)**, **Question column 2 (read-only)** (Req 5.1), a **Mandatory/Optional marker** (Req 5.4), an **example value** (Req 5.5), a **Comments/Details hint** (Req 5.6), and an **editable Client answer** control (Req 5.2).
- `canAnswer = authService.isAuthenticated() && !authService.isAdmin()` (a `Member_User`). When `canAnswer`, the Client answer field is editable (Req 5.3); otherwise it is read-only.
- On answer save (blur/explicit save), calls `prerequisitesService.saveClientAnswer(slug, rowId, answer)` (Req 5.7). On failure, shows a per-row/page error indication (Req 6.5).

```tsx
export const QuestionAnswerForm = ({ slug, title, config }: QuestionAnswerFormProps) => {
  const canAnswer = authService.isAuthenticated() && !authService.isAdmin();
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [errorRowIds, setErrorRowIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    prerequisitesService.loadClientAnswers(slug)
      .then((r) => setAnswers(r.answers))
      .catch(() => {/* surface load error */});
  }, [slug]);

  const saveAnswer = async (rowId: string, value: string) => {
    setAnswers((a) => ({ ...a, [rowId]: value }));
    try {
      await prerequisitesService.saveClientAnswer(slug, rowId, value); // Req 5.7
    } catch {
      setErrorRowIds((s) => new Set(s).add(rowId)); // Req 6.5
    }
  };
  // renders question cols (read-only), marker, example, hint, and Client answer input
};
```

## Data Models

### `FormConfig` extensions (`types.ts`)

The existing `ParameterRow`/`SubSection`/`FormConfig` are extended with optional question-archetype fields. They are **optional** so the current `cloudStoreConfig` shape and `TrackingForm`/`configs.test.ts` remain valid (Req 8.3, 8.4, 7.4).

```ts
export interface QuestionRow {
  id: string;                 // stable, unique within a page (Req 7.3)
  questionPrimary: string;    // read-only question column 1 (Req 5.1)
  questionSecondary?: string; // read-only question column 2 (Req 5.1)
  mandatory: boolean;         // drives Mandatory/Optional marker (Req 5.4)
  exampleValue?: string;      // example value shown to the customer (Req 5.5)
  commentsHint?: string;      // Comments/Details hint (Req 5.6)
}

export interface QuestionSection {
  id: string;
  title: string;
  rows: QuestionRow[];
}

// Existing ParameterRow / SubSection / FormConfig are retained unchanged for
// TrackingForm. QuestionAnswerForm uses the question-oriented shape below.
export interface QuestionFormConfig {
  sections: QuestionSection[];
}
```

Design choice on typing: rather than mutate the existing `FormConfig` (which would ripple into `TrackingForm` and its property tests), we add a parallel `QuestionFormConfig`. `configs.ts` exports both the legacy `cloudStoreConfig: FormConfig` (kept until `TrackingForm` is retired) and the new question configs typed as `QuestionFormConfig`. This keeps `configs.test.ts` green while satisfying Req 7.1/7.4.

### Question configs (`configs.ts`)

Four `QuestionFormConfig` values are added: `networkChecklistConfig`, `coreControlPlaneConfig`, `cloudStoreConfig` (question variant), `vcfConfig`. Where definitive text is unavailable, each is scaffolded with placeholder/example rows (Req 7.2), every row carrying a stable, page-unique `id` (Req 7.3). Example scaffold:

```ts
export const networkChecklistConfig: QuestionFormConfig = {
  sections: [
    {
      id: 'general',
      title: 'Général',
      rows: [
        {
          id: 'nc-placeholder-1',
          questionPrimary: 'Question 1 (placeholder)',
          questionSecondary: 'Détail (placeholder)',
          mandatory: true,
          exampleValue: 'ex. 10.0.0.0/24',
          commentsHint: 'Précisez le contexte réseau.',
        },
        // …additional placeholder rows
      ],
    },
  ],
};
```

### Static-content model

Static pages persist a single HTML/markdown string per slug:

```ts
export interface StaticContent { slug: string; content: string; updatedAt?: string; }
```

### Client-answer model

Question pages persist a `rowId -> answer` map per slug:

```ts
export interface ClientAnswers { slug: string; answers: Record<string, string>; }
```

## Backend Persistence

**The backend framework was not inspected during the Clarify phase.** This section therefore specifies the **API contract at the interface level** so the backend team can implement it in whatever framework the server uses. The contract follows the conventions already visible in the frontend services (`api.ts` axios instance with `Bearer` auth, `/api` base URL, snake_case JSON bodies as in `authService`/`adminService`).

### Frontend service (`frontend/src/services/prerequisitesService.ts`)

Replaces the `localStorage`-based `usePersistentForm` for the new pages (Req 6.4). Mirrors `adminService`/`authService` style (thin axios wrappers returning `response.data`).

```ts
import api from './api';

export interface StaticContentResponse { slug: string; content: string; updated_at?: string; }
export interface ClientAnswersResponse { slug: string; answers: Record<string, string>; }

export const prerequisitesService = {
  // Static content (Basics, Network Flux)
  async loadStaticContent(slug: string): Promise<StaticContentResponse> {
    const res = await api.get(`/prerequisites/${slug}/content`);
    return res.data;
  },
  async saveStaticContent(slug: string, content: string): Promise<void> {
    await api.put(`/prerequisites/${slug}/content`, { content }); // Req 4.4
  },

  // Client answers (Network Checklist, Core Control Plane, CloudStore, VCF)
  async loadClientAnswers(slug: string): Promise<ClientAnswersResponse> {
    const res = await api.get(`/prerequisites/${slug}/answers`);
    return res.data;
  },
  async saveClientAnswer(slug: string, rowId: string, answer: string): Promise<void> {
    await api.put(`/prerequisites/${slug}/answers/${rowId}`, { answer }); // Req 5.7
  },
};
```

### Prerequisites_API endpoints (backend contract)

All endpoints require a valid `Authorization: Bearer <token>` (consistent with `ProtectedRoute` gating the pages and the axios request interceptor). Content mutations must additionally be authorized: static-content writes are admin-only; answer writes are allowed for authenticated non-admin members.

| Method | Path | Purpose | Auth |
| --- | --- | --- | --- |
| GET | `/api/prerequisites/{slug}/content` | Retrieve static page content (Req 6.2) | Authenticated |
| PUT | `/api/prerequisites/{slug}/content` | Save static page content (Req 4.4, 6.1, 6.3) | Admin only |
| GET | `/api/prerequisites/{slug}/answers` | Retrieve all client answers for a page (Req 6.2) | Authenticated |
| PUT | `/api/prerequisites/{slug}/answers/{rowId}` | Save one client answer (Req 5.7, 6.1, 6.3) | Member (authenticated non-admin) |

Request/response schemas (JSON):

```
GET  /prerequisites/{slug}/content
  200 → { "slug": "basics", "content": "<html>", "updated_at": "2026-01-01T00:00:00Z" }

PUT  /prerequisites/{slug}/content
  body: { "content": "<html>" }
  200 → { "slug": "basics", "content": "<html>", "updated_at": "…" }
  403 → if caller is not admin

GET  /prerequisites/{slug}/answers
  200 → { "slug": "cloudstore", "answers": { "nc-placeholder-1": "10.0.0.0/24", … } }

PUT  /prerequisites/{slug}/answers/{rowId}
  body: { "answer": "10.0.0.0/24" }
  200 → { "slug": "cloudstore", "row_id": "nc-placeholder-1", "answer": "10.0.0.0/24" }
```

Because saved changes are stored server-side and served to every subsequent `GET`, they are shared across users and sessions (Req 6.1, 6.3). The frontend never reads/writes `localStorage` for these pages (Req 6.4).

### Error handling (Req 6.5)

- The axios instance already redirects to `/login` on `401`. Pages must not rely on that for save feedback.
- Every `save*` call in a page component is wrapped in `try/catch`. On rejection (network error, `4xx`/`5xx`), the page sets an error state and renders a visible error indication (a banner for static content; a per-row error marker for client answers). The in-memory value the user typed is preserved so they can retry.
- `loadStaticContent`/`loadClientAnswers` failures render a non-blocking load-error message; pages still render their static structure/config.

## Role Handling

- **Admin_User**: `authService.isAdmin()` returns true (`localStorage 'user_role' === 'administrator'`). Can edit static content; on question pages the Client answer column is read-only for admins (answering is a member action per Req 5.3).
- **Member_User**: `authService.isAuthenticated()` is true and `isAdmin()` is false. Can edit the Client answer column; sees static content read-only.
- **Unauthenticated**: cannot reach any prerequisites page — `ProtectedRoute` redirects to `/login` (Req 2.3).

No new role or claim is introduced; gating reuses the two existing predicates.

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Navigation entries map to their configured routes (desktop and mobile)

*For any* entry in `PREREQ_NAV_ITEMS`, the navigation link rendered by `Layout` — in both the desktop dropdown and the mobile menu — targets exactly that entry's configured `route`.

**Validates: Requirements 1.5, 1.6**

### Property 2: Every navigation route is well-formed

*For any* entry in `PREREQ_NAV_ITEMS`, the `label` is non-empty and the `route` matches `/^\/prerequisites\/[a-z0-9-]+$/`.

**Validates: Requirements 1.2**

### Property 3: Authenticated access renders the matching prerequisites page

*For any* prerequisites route, when the user is authenticated, navigating to that route renders the corresponding page and does not render the login redirect target.

**Validates: Requirements 2.1, 2.4**

### Property 4: Unauthenticated access redirects to login

*For any* prerequisites route, when the user is unauthenticated, the route renders the login redirect target and does not render the protected page.

**Validates: Requirements 2.2, 2.3**

### Property 5: Static-content edit controls appear exactly for admins

*For any* authenticated user and any static-content page, the page presents edit controls when `authService.isAdmin()` is true and presents the content read-only (no edit controls) when it is false.

**Validates: Requirements 4.2, 4.3, 4.5**

### Property 6: Question pages show read-only questions and an editable member answer

*For any* `QuestionFormConfig`, each rendered row exposes both question columns as read-only (non-editable) and exposes exactly one Client answer control that is editable when the current user is a `Member_User`.

**Validates: Requirements 5.1, 5.2, 5.3**

### Property 7: Every question row displays its required annotations

*For any* `QuestionFormConfig`, each rendered row displays a Mandatory marker when `row.mandatory` is true (and an Optional marker otherwise), its example value, and its Comments/Details hint.

**Validates: Requirements 5.4, 5.5, 5.6**

### Property 8: Saving static content forwards it to the service

*For any* content string, when an `Admin_User` saves a static-content page, `prerequisitesService.saveStaticContent` is called with that page's slug and the exact content.

**Validates: Requirements 4.4**

### Property 9: Saving a client answer forwards it to the service

*For any* row id and answer string, when a `Member_User` saves a Client answer, `prerequisitesService.saveClientAnswer` is called with the page slug, that row id, and the exact answer.

**Validates: Requirements 5.7**

### Property 10: Opening a page loads persisted data through the service

*For any* server response payload, opening a static-content or question page invokes the corresponding `prerequisitesService` load method for that slug and renders the returned content/answers, without reading browser-local storage.

**Validates: Requirements 6.2, 6.4**

### Property 11: A failed save shows an error indication

*For any* save operation whose `prerequisitesService` call rejects, the page renders a visible error indication to the user.

**Validates: Requirements 6.5**

### Property 12: Row ids are unique within each page

*For any* prerequisites config (legacy `FormConfig` or new `QuestionFormConfig`), the set of row ids has size equal to the total number of rows.

**Validates: Requirements 7.3**

## Testing Strategy

### Dual approach

- **Property tests** (fast-check, `numRuns >= 100`, tagged `Feature: opcp-prerequisites-tabs, Property {n}: {text}`) cover the universal properties above.
- **Unit/example tests** cover specific content and structure (the seven-entry set, LandingZone exclusion, OPCP Core → Core Control Plane mapping, How-to-use legend/tips/secrets warning, config existence/scaffolding).
- **Integration** concerns (server-side persistence and cross-session sharing, Req 6.1/6.3) are validated by backend tests; the frontend mocks `prerequisitesService`.

### Keeping existing suites green (Req 8.1–8.5)

- **`Layout.prereq.test.tsx`** — stays structurally valid; it quantifies over `PREREQ_NAV_ITEMS`, so it automatically exercises the new seven entries. Any assertion referencing the old `OPCP Core`/`LandingZone` labels or routes is updated to the new set (Req 8.5).
- **`prerequisitesRoutes.test.tsx`** — updated to import the new page components and to use the seven `PREREQ_ROUTES` (removing `opcp-core`/`landingzone`, adding the new slugs), while keeping the same auth-guard assertions (Req 8.2, 8.5). Where pages now call `prerequisitesService`, the service is mocked to isolate route/guard behavior.
- **`configs.test.ts`** — the existing `cloudStoreConfig` structural assertions and the row-id uniqueness test are preserved. The uniqueness `it.each` list is updated to reference existing/new question configs instead of `opcpCoreConfig`/`landingZoneConfig` (Req 8.3, 8.5).
- **`TrackingForm.test.tsx`** — `TrackingForm` and `usePersistentForm` are left untouched, so this suite stays green as-is (Req 8.4). It is retired only after `TrackingForm` is fully removed, which is out of scope for this feature.

### New tests

- `HowToUse.test.tsx` — legend, tips, secrets warning present; no editable controls for any role (Req 3.x).
- `StaticContentPage.test.tsx` — Property 5 (admin-only edit controls), Property 8 (save forwards to service), Property 10/11 (load + error), content read-only for members.
- `QuestionAnswerForm.test.tsx` — Property 6 (read-only questions + editable member answer), Property 7 (marker/example/hints), Property 9 (save forwards), Property 11 (error).
- `prerequisitesService.test.ts` — verifies each method issues the correct HTTP verb/path/body against a mocked `api` (contract-level), and that pages use it instead of `localStorage` (Req 6.4).
- Config tests for the four new `QuestionFormConfig`s: Property 12 (row-id uniqueness) and non-empty scaffolding (Req 7.1, 7.2).

## Requirements Traceability

| Requirement | Design element |
| --- | --- |
| 1.1 seven entries | `PREREQ_NAV_ITEMS` (types.ts) |
| 1.2 label + `/prerequisites/{slug}` | `PREREQ_NAV_ITEMS` shape; Property 2 |
| 1.3 exclude LandingZone | `PREREQ_NAV_ITEMS` (removed); App.tsx route removed |
| 1.4 OPCP Core → Core Control Plane | `Core Control Plane` entry at `/prerequisites/core-control-plane`; `CoreControlPlanePage` |
| 1.5, 1.6 desktop + mobile render config | `Layout.tsx` (unchanged iteration); Property 1 |
| 2.1 route per entry | `App.tsx` seven routes |
| 2.2 routes guarded | `ProtectedRoute` wrapping each route; Property 3/4 |
| 2.3 unauthenticated redirect | `ProtectedRoute` → `/login`; Property 4 |
| 2.4 authenticated renders page | `App.tsx` + page components; Property 3 |
| 3.1 read-only for all | `HowToUse` (presentational, no inputs) |
| 3.2 legend | `HowToUse` + `PREREQ_MARKERS` |
| 3.3 tips/examples | `HowToUse` |
| 3.4 secrets warning | `HowToUse` callout |
| 4.1 content to all authenticated | `StaticContentPage` load + render |
| 4.2 admin edit controls | `StaticContentPage` (canEdit); Property 5 |
| 4.3 member read-only | `StaticContentPage`; Property 5 |
| 4.4 admin save → API | `saveStaticContent`; Property 8 |
| 4.5 uses isAdmin() | `StaticContentPage` `canEdit = authService.isAdmin()` |
| 5.1 read-only question columns | `QuestionAnswerForm`; Property 6 |
| 5.2 editable Client answer | `QuestionAnswerForm`; Property 6 |
| 5.3 member can edit | `QuestionAnswerForm` `canAnswer`; Property 6 |
| 5.4 mandatory/optional marker | `QuestionRow.mandatory` + `PREREQ_MARKERS`; Property 7 |
| 5.5 example values | `QuestionRow.exampleValue`; Property 7 |
| 5.6 comments/details hints | `QuestionRow.commentsHint`; Property 7 |
| 5.7 member save → API | `saveClientAnswer`; Property 9 |
| 6.1 server persistence | Prerequisites_API PUT endpoints (backend contract) |
| 6.2 retrieve on open | `loadStaticContent`/`loadClientAnswers`; Property 10 |
| 6.3 shared across users/sessions | Prerequisites_API server-side store (backend) |
| 6.4 service instead of localStorage | `prerequisitesService`; Property 10 |
| 6.5 save failure error indication | page `try/catch` + error state; Property 11 |
| 7.1 FormConfig per Q/A page | four `QuestionFormConfig`s in `configs.ts` |
| 7.2 placeholder/example rows | scaffolded rows in question configs |
| 7.3 stable unique row ids | `QuestionRow.id`; Property 12 |
| 7.4 follow FormConfig pattern | `QuestionFormConfig` in `types.ts`, configs in `configs.ts` |
| 8.1 Layout.prereq.test green | updated entry references |
| 8.2 prerequisitesRoutes.test green | updated page imports/routes + mocked service |
| 8.3 configs.test green | preserved cloudStore assertions + updated uniqueness list |
| 8.4 TrackingForm.test green | `TrackingForm`/`usePersistentForm` left untouched |
| 8.5 update removed/renamed refs | test updates across the three affected suites |

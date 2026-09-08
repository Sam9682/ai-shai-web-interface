# Design Document

## Overview

This feature adds an authentication-gated "OPCP installation prerequisites" navigation dropdown and three tracking pages (OPCP Core, CloudStore, LandingZone) to the existing React + TypeScript + Vite frontend. It is entirely frontend-only: there is no backend, API, or database involvement. All tracking data lives in component state and is persisted to browser `localStorage`, one distinct key per page.

The three pages share a single, data-driven `TrackingForm` component. Each page supplies a static configuration describing its sub-sections and parameter rows; the shared component renders every row with the same four fields (Value, Status, Date Received, Comments), the same status choices, and the same status legend. This keeps the CloudStore page (which reproduces the reference document's seven sub-sections) and the placeholder OPCP Core / LandingZone pages structurally identical, differing only in their configuration data.

The design mirrors existing conventions:
- Navigation follows the `Événements` hover-dropdown pattern already in `Layout.tsx` (desktop `onMouseEnter`/`onMouseLeave` + a nested mobile entry).
- Routes are registered inside the nested `<Routes>` in `App.tsx`, each wrapped in the existing `ProtectedRoute`.
- Page styling reuses `NewTopicPage.tsx` conventions (`card p-6`, headings `text-2xl font-bold text-[#000E9C]`, inputs with `focus:ring-[#4949FF]`, buttons `bg-[#000E9C] hover:bg-[#4949FF]`).
- All UI text is in French; the theme color is `#000E9C`.

## Architecture

```
Layout.tsx (nav)
  ├── Desktop: "OPCP installation prerequisites" hover-dropdown  ──► 3 <Link>
  └── Mobile:  nested section with 3 nested <Link>
                                    │
App.tsx (nested Routes)             ▼
  /prerequisites/opcp-core   → ProtectedRoute → OPCPCorePage   ┐
  /prerequisites/cloudstore  → ProtectedRoute → CloudStorePage ├─ each renders <TrackingForm config storageKey />
  /prerequisites/landingzone → ProtectedRoute → LandingZonePage┘
                                    │
components/prerequisites/           ▼
  TrackingForm.tsx  ── renders sub-sections & rows, status legend
  types.ts          ── FormConfig / SubSection / ParameterRow / RowState / Status
  configs.ts        ── opcpCoreConfig, cloudStoreConfig, landingZoneConfig
hooks/
  usePersistentForm.ts ── load-on-mount (with parse-failure fallback), save-on-edit
```

Data flow:
1. A page component calls `usePersistentForm(storageKey, defaultConfig)` which returns the current form state plus an `updateField` setter.
2. On mount, the hook reads `localStorage[storageKey]`. If present and parseable into a valid shape it seeds state from it; otherwise it seeds from the config-derived defaults.
3. `TrackingForm` renders sub-sections and rows from the config, wiring each field to the current state and to `updateField`.
4. Any field edit calls `updateField`, which updates React state and writes the serialized state back to `localStorage[storageKey]`.

## Components and Interfaces

### Navigation (`Layout.tsx`)

A new desktop dropdown is added inside the existing `isAuthenticated && (...)` block, immediately mirroring the `Événements` block. It uses its own local state flag (e.g. `showPrereqMenu`) and a shared nav-item config so the desktop and mobile menus render from one source of truth.

Desktop (hover dropdown):
```tsx
<div className="relative"
     onMouseEnter={() => setShowPrereqMenu(true)}
     onMouseLeave={() => setShowPrereqMenu(false)}>
  <span className="px-3 py-1.5 text-sm font-medium text-white/90 hover:text-white hover:bg-white/10 rounded cursor-pointer">
    OPCP installation prerequisites <span className="ml-0.5 text-xs">▾</span>
  </span>
  {showPrereqMenu && (
    <div className="absolute top-full left-0 mt-1 w-56 bg-white rounded shadow-lg border border-gray-200 py-1 z-50">
      {PREREQ_NAV_ITEMS.map(item => (
        <Link key={item.route} to={item.route}
              className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 hover:no-underline">
          {item.label}
        </Link>
      ))}
    </div>
  )}
</div>
```

Mobile (nested entries, mirrors the admin-events nested `pl-6` pattern):
```tsx
<div className="px-3 py-2 text-sm font-medium text-gray-700">OPCP installation prerequisites</div>
{PREREQ_NAV_ITEMS.map(item => (
  <Link key={item.route} to={item.route}
        onClick={() => setMobileMenuOpen(false)}
        className="block px-3 py-2 pl-6 text-sm text-gray-600 hover:bg-gray-50 rounded hover:no-underline">
    {item.label}
  </Link>
))}
```

Shared nav config:
```ts
export const PREREQ_NAV_ITEMS = [
  { label: 'OPCP Core',  route: '/prerequisites/opcp-core' },
  { label: 'CloudStore', route: '/prerequisites/cloudstore' },
  { label: 'LandingZone', route: '/prerequisites/landingzone' },
] as const;
```

Both blocks live inside the existing `{isAuthenticated && (...)}` guards, satisfying show-while-authenticated / hide-while-not.

### Routing (`App.tsx`)

Three routes are added inside the nested `<Routes>`, each wrapped in `ProtectedRoute`:
```tsx
<Route path="/prerequisites/opcp-core"   element={<ProtectedRoute><OPCPCorePage /></ProtectedRoute>} />
<Route path="/prerequisites/cloudstore"  element={<ProtectedRoute><CloudStorePage /></ProtectedRoute>} />
<Route path="/prerequisites/landingzone" element={<ProtectedRoute><LandingZonePage /></ProtectedRoute>} />
```
`ProtectedRoute` already redirects unauthenticated users to `/login`, so no new guard logic is required.

### Types (`components/prerequisites/types.ts`)

```ts
export type Status = 'received' | 'pending' | 'blocked' | 'na';

export interface StatusMeta { value: Status; label: string; icon: string; }

export const STATUS_OPTIONS: StatusMeta[] = [
  { value: 'received', label: 'Reçu',    icon: '✅' },
  { value: 'pending',  label: 'En attente', icon: '⏳' },
  { value: 'blocked',  label: 'Bloqué',   icon: '❌' },
  { value: 'na',       label: 'N/A',      icon: '—' },
];

// Static description of a parameter row (from config)
export interface ParameterRow {
  id: string;          // stable key, unique within a page
  label: string;       // French label shown to the coordinator
  defaultValue?: string;
}

export interface SubSection {
  id: string;
  title: string;       // French sub-section heading
  rows: ParameterRow[];
}

export interface FormConfig {
  sections: SubSection[];
}

// Editable per-row state (persisted)
export interface RowState {
  value: string;
  status: Status;
  dateReceived: string; // ISO yyyy-mm-dd or ''
  comments: string;
}

export type RowField = keyof RowState;

// Persisted shape: rowId -> RowState
export type FormState = Record<string, RowState>;
```

### Shared component (`TrackingForm.tsx`)

```ts
interface TrackingFormProps {
  title: string;        // page title, e.g. "CloudStore"
  storageKey: string;   // distinct localStorage key
  config: FormConfig;
}
```
Responsibilities:
- Call `usePersistentForm(storageKey, config)` to obtain `{ state, updateField }`.
- Render the page title (`text-2xl font-bold text-[#000E9C]`) inside a `card p-6`.
- Render a `StatusLegend` (maps each `STATUS_OPTIONS` entry to `icon + label`).
- For each `SubSection`, render a sub-heading, then each `ParameterRow` as a row exposing exactly four controls:
  - Value: `<input type="text">`
  - Status: `<select>` populated from `STATUS_OPTIONS`
  - Date Received: `<input type="date">`
  - Comments: `<textarea>` (or text input)
- Each control's `onChange` calls `updateField(rowId, field, newValue)`.
- Inputs reuse the border/`focus:ring-[#4949FF]` styling from `NewTopicPage.tsx`.

Because every row is rendered by this one component, all pages automatically share the four-field structure, status choices, and legend.

### Persistence hook (`hooks/usePersistentForm.ts`)

```ts
function buildDefaults(config: FormConfig): FormState;      // row.defaultValue or '' ; status 'pending'
function isValidFormState(x: unknown, config: FormConfig): x is FormState;

export function usePersistentForm(storageKey: string, config: FormConfig): {
  state: FormState;
  updateField: (rowId: string, field: RowField, value: string) => void;
};
```
Behavior:
- Initial state (lazy `useState` initializer):
  - Read `localStorage.getItem(storageKey)`.
  - If `null` → `buildDefaults(config)`.
  - Else `JSON.parse` inside `try/catch`; on parse error or failed `isValidFormState` → `buildDefaults(config)`.
  - Merge parsed rows over defaults so that rows added to the config later still appear.
- `updateField` produces the next state, calls `setState`, and writes `JSON.stringify(next)` to `localStorage[storageKey]`.
- Storage keys are page-specific constants (`opcp_prereq_core`, `opcp_prereq_cloudstore`, `opcp_prereq_landingzone`), guaranteeing no cross-page overwrite.

### Page components

Each page is a thin wrapper:
```tsx
export const CloudStorePage = () =>
  <TrackingForm title="CloudStore" storageKey="opcp_prereq_cloudstore" config={cloudStoreConfig} />;
```
`OPCPCorePage` and `LandingZonePage` follow the same shape with their own keys and configs.

## Data Models

### CloudStore configuration (`configs.ts`)

Derived directly from Requirement 4's seven sub-sections. Labels are in French; row `id`s are stable slugs.

| Sub-section | Parameter rows |
| --- | --- |
| Configuration réseau | Nom du réseau · Nom du sous-réseau · CIDR du sous-réseau · IP passerelle · VLAN ID · Plage DHCP (10 IP exclues) |
| Serveur (Standalone) | Rôle · Nom d'hôte · Adresse IP · Node UUID · Ingress VIP (Cilium L2, statique) · Cluster 3 nœuds (optionnel) · VIP endpoint cluster |
| Configuration DNS | Nom de zone DNS · Cible de délégation (ingress VIP) · IP serveur DNS primaire · IP serveur DNS de secours |
| Configuration NTP | IP serveur NTP 1 · Nom DNS serveur NTP 1 · IP serveur NTP 2 · Nom DNS serveur NTP 2 |
| Sécurité & Certificats | Certificat Root CA |
| Sauvegarde (S3) | Sauvegarde activée · URL endpoint S3 · Région · Bucket · Clé d'accès · Clé secrète · Chemin de sauvegarde (défaut `cs-backups`) |
| Actions côté client | Réseau/sous-réseau créé · Réseaux câblés vers l'edge du rack OPCP · Hôte bastion provisionné · Accès bastion fourni · Délégation de zone DNS configurée · Bucket de sauvegarde S3 fourni et joignable |

The "Chemin de sauvegarde" row carries `defaultValue: 'cs-backups'`.

### OPCP Core & LandingZone configurations

Inferred placeholder configs, structurally identical, marked for later refinement. Example OPCP Core:

| Sub-section | Placeholder rows |
| --- | --- |
| Configuration générale | Paramètre 1 · Paramètre 2 · Paramètre 3 |

Example LandingZone:

| Sub-section | Placeholder rows |
| --- | --- |
| Configuration Landing Zone | Paramètre 1 · Paramètre 2 · Paramètre 3 |

These exist so coordinators can begin tracking; they reuse `TrackingForm` and thus inherit the identical field structure and legend.

### Persisted `localStorage` entry

Per page, under its distinct key, a JSON object mapping each row `id` to a `RowState`:
```json
{
  "network-name": { "value": "prod-net", "status": "received", "dateReceived": "2026-01-15", "comments": "" },
  "subnet-cidr":  { "value": "10.0.0.0/24", "status": "pending", "dateReceived": "", "comments": "à confirmer" }
}
```

## Error Handling

- **Corrupt/unparseable storage (Req 7.4):** the hook wraps `JSON.parse` in `try/catch` and validates the parsed shape; on any failure it silently falls back to config defaults so the page always renders.
- **Missing storage (Req 7.3):** a `null` read yields defaults.
- **Schema drift:** parsed rows are merged over freshly built defaults, so configs that gain rows over time still render (missing rows get defaults; unknown stored rows are ignored).
- **`localStorage` unavailable / write failure:** reads and writes are guarded so an exception (e.g. storage disabled or quota exceeded) is caught and does not break rendering or editing; the in-memory state remains authoritative for the session.
- **Navigation while unauthenticated:** handled by the existing `ProtectedRoute` redirect to `/login`; no additional handling needed.

## Testing Strategy

Dual approach with Vitest + React Testing Library (Vite project). Property tests use `fast-check` at a minimum of 100 iterations each and reference their design property. Unit/example tests cover rendering conditions, static content (legend, French labels), and route wiring. Property tests cover the persistence helper and the config-driven rendering invariants. `localStorage` is stubbed/reset between tests.

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Navigation entries map to their configured routes

*For any* entry in the prerequisites navigation configuration, the rendered navigation link SHALL target exactly the route configured for that entry.

**Validates: Requirements 1.5, 1.6, 1.7**

### Property 2: Every parameter row renders all four fields

*For any* form configuration and *any* parameter row within it, the rendered row SHALL expose exactly a Value field, a Status field, a Date Received field, and a Comments field.

**Validates: Requirements 5.1, 6.3, 6.4**

### Property 3: Status field offers exactly the four status choices

*For any* parameter row, the set of options presented by its Status field SHALL equal exactly {Received (✅), Pending (⏳), Blocked (❌), N/A}.

**Validates: Requirements 5.2**

### Property 4: Editing a field updates the in-memory value

*For any* parameter row, *any* one of its four fields, and *any* entered value, after the edit the in-memory form state for that row and field SHALL equal the entered value.

**Validates: Requirements 5.4**

### Property 5: Persist-then-load round trip

*For any* valid form state written by an edit under a page's storage key, loading that page SHALL populate the form with a state equal to the persisted state.

**Validates: Requirements 7.1, 7.2**

### Property 6: Unparseable storage falls back to defaults

*For any* string stored under a page's storage key that is not a valid serialized form state, loading that page SHALL populate the form with its default configuration and SHALL NOT throw.

**Validates: Requirements 7.4**

### Property 7: Per-page storage isolation

*For any* pair of distinct prerequisites pages, their storage keys SHALL differ, so that writing the form data for one page SHALL leave the stored data of the other page unchanged.

**Validates: Requirements 7.5**

# Tasks Menu Not Displayed Bugfix Design

## Overview

The navigation bar renders no "Tasks" menu even though the Tasks feature is coded (`frontend/src/services/taskService.ts` exists and is functional) and fully specified in the `manage-tasks` design spec. The "Events" menu, by contrast, renders correctly with a "Manage events" admin dropdown, a `/admin/events` route, and `nav.events` / `nav.events.manage` translation keys in both French and English.

The root cause is confirmed to be missing wiring rather than a logic fault: the Tasks entry was never added to the navigation layer. Three files are involved:

- `frontend/src/components/Layout.tsx` — renders Home, Forum, Events (with `/admin/events` dropdown), Documents, AI Oracle, OPCP installations, Users, and Configuration, but nothing for Tasks in either the desktop or mobile menu.
- `frontend/src/i18n/translations.ts` — defines `nav.events` and `nav.events.manage` (FR + EN) but has no `nav.tasks` / `nav.tasks.manage` key.
- `frontend/src/App.tsx` — defines a `/admin/tasks`-less route table; `/admin/events` exists but there is no `/admin/tasks` route and no `AdminTasksPage` import.

The fix is targeted and additive: introduce a Tasks menu item and "Manage tasks" admin dropdown mirroring the exact Events wiring pattern in `Layout.tsx`, add `nav.tasks` and `nav.tasks.manage` keys in both FR and EN, and register a `/admin/tasks` route guarded by `ProtectedRoute` exactly like `/admin/events`. Because the Events wiring is the template, the change surface is small and the regression risk to existing nav items, routes, admin gating, and FR/EN switching is low — but this design explicitly documents each of those as preservation requirements.

Note: `AdminTasksPage` is prescribed by the `manage-tasks` spec. This bugfix wires the route to it; if the page component does not yet exist it must be created per the `manage-tasks` design so the `/admin/tasks` route resolves to a real page.

## Glossary

- **Bug_Condition (C)**: The condition that triggers the bug — the navigation is asked to present or resolve a Tasks entry (Tasks menu item, "Manage tasks" dropdown, `nav.tasks.manage` label lookup, or `/admin/tasks` route) and the wiring for it does not exist.
- **Property (P)**: The desired behavior — a Tasks menu item and admin "Manage tasks" dropdown render analogously to Events, the `nav.tasks` / `nav.tasks.manage` labels resolve in FR and EN, and `/admin/tasks` resolves to the Tasks admin page under the same protection as `/admin/events`.
- **Preservation**: All existing navigation items, routes, admin gating, and FR/EN language switching must remain byte-for-byte behaviorally unchanged, including the entire Events menu.
- **Layout**: The `Layout` component in `frontend/src/components/Layout.tsx` that renders the desktop and mobile navigation.
- **isAdmin / isAuthenticated**: `authService.isAdmin()` / `authService.isAuthenticated()` gates in `Layout.tsx` that control which nav items and dropdown entries render.
- **t(key)**: The translation resolver from `useTranslation()` (`frontend/src/hooks/useLanguage`) that maps a nav key to the current-language string in `translations.ts`.
- **ProtectedRoute**: The route wrapper in `frontend/src/components/ProtectedRoute` used for all `/admin/*` and authenticated routes, including `/admin/events`.

## Bug Details

### Bug Condition

The bug manifests whenever the navigation layer is expected to surface Tasks. The desktop menu, the mobile menu, the translation resolver, and the router all lack the Tasks wiring: there is no Tasks `<Link>` / dropdown in `Layout.tsx`, no `nav.tasks.manage` key in `translations.ts`, and no `/admin/tasks` `<Route>` in `App.tsx`. The Tasks feature is therefore unreachable from the UI.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type NavigationInteraction
         (viewing desktop nav, viewing mobile nav, resolving a nav label,
          or navigating to a route)
  OUTPUT: boolean

  RETURN input targets the Tasks feature
         AND (
              (input.kind == RENDER_DESKTOP_NAV AND NOT tasksMenuItemExists())
           OR (input.kind == RENDER_MOBILE_NAV  AND NOT tasksMobileEntryExists())
           OR (input.kind == RESOLVE_LABEL       AND input.key == 'nav.tasks.manage'
                                                 AND NOT translationKeyExists(input.key, language))
           OR (input.kind == NAVIGATE            AND input.path == '/admin/tasks'
                                                 AND NOT routeExists(input.path))
         )
END FUNCTION
```

### Examples

- **Desktop nav, authenticated user**: The nav bar shows Home, Forum, Events, Documents, AI Oracle, OPCP installations (and Users/Configuration for admins). Expected: a "Tasks" item next to Events. Actual: no Tasks item.
- **Desktop nav, admin hover**: Hovering Events shows a "Manage events" → `/admin/events` dropdown. Expected: a "Tasks" item whose hover shows "Manage tasks" → `/admin/tasks`. Actual: no Tasks dropdown exists.
- **Mobile menu, authenticated user**: The mobile menu lists Forum, Events, (admin: Manage events), Documents, AI Oracle, etc. Expected: a "Tasks" entry, and for admins a "Manage tasks" sub-entry → `/admin/tasks`. Actual: no Tasks entries.
- **Label resolution**: `t('nav.tasks.manage')` is expected to return "Gérer les tâches" (FR) / "Manage tasks" (EN). Actual: the key is absent, so the lookup does not resolve to a defined label.
- **Route navigation (edge case)**: Navigating to `/admin/tasks` should render the Tasks admin page under `ProtectedRoute`. Actual: no route is defined, so it falls through the `/*` route table without rendering the Tasks page.

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- The Events menu and its admin "Manage events" → `/admin/events` dropdown must continue to render exactly as before (desktop and mobile). (Req 3.1)
- Home, Forum, Documents, AI Oracle, OPCP installations, Users, and Configuration must continue to render with their existing routes and admin gating. (Req 3.2)
- Switching language between French and English must continue to resolve all existing nav labels, including `nav.events` and `nav.events.manage`. (Req 3.3)
- Navigating to `/admin/events` or any other existing route must continue to render the corresponding page under its existing route protection. (Req 3.4)
- A non-admin authenticated user must continue to have admin-only dropdown entries hidden; the same gating must apply to the new "Manage tasks" entry as to "Manage events". (Req 3.5)

**Scope:**
All navigation interactions that do NOT target the Tasks feature must be completely unaffected by this fix. This includes:
- Rendering and clicking every existing desktop nav item and dropdown.
- Rendering and clicking every existing mobile nav item and sub-entry.
- Resolving every existing translation key in both FR and EN.
- Resolving every existing route (authenticated, admin-gated, and public).

**Note:** The expected correct behavior for the Tasks wiring itself is defined in the Correctness Properties section (Property 1).

## Hypothesized Root Cause

The bug description and code review already confirm the cause: the Tasks wiring is simply absent. The "root cause" here is which specific pieces are missing, so the fix is complete and mirrors Events exactly.

1. **Missing desktop nav item and dropdown (`Layout.tsx`)**: The desktop menu block that renders `nav.forum`, the Events dropdown, `nav.documents`, etc., has no Tasks `<Link>` and no Tasks dropdown state/markup analogous to `showEventsMenu` + the `/admin/events` link.

2. **Missing mobile nav entries (`Layout.tsx`)**: The mobile menu block has no Tasks `<Link>` and no admin "Manage tasks" sub-entry analogous to the mobile Events + `/admin/events` entries.

3. **Missing translation keys (`translations.ts`)**: Neither the FR block (around the `nav.events` / `nav.events.manage` entries) nor the EN block defines `nav.tasks` or `nav.tasks.manage`.

4. **Missing route and page wiring (`App.tsx`)**: There is no `<Route path="/admin/tasks" ...>` and no `AdminTasksPage` import, unlike the existing `/admin/events` → `AdminEventsPage` route.

## Correctness Properties

Property 1: Bug Condition - Tasks Navigation Is Wired Like Events

_For any_ navigation interaction where the bug condition holds (isBugCondition returns true — i.e. the interaction targets the Tasks feature), the fixed code SHALL surface Tasks analogously to Events: the desktop nav SHALL render a "Tasks" menu item, an authenticated admin SHALL see a "Manage tasks" dropdown linking to `/admin/tasks`, the mobile menu SHALL render a "Tasks" entry (with an admin "Manage tasks" sub-entry to `/admin/tasks`), `t('nav.tasks.manage')` SHALL resolve to the correct FR/EN label, and navigating to `/admin/tasks` SHALL render the Tasks admin page under the same `ProtectedRoute` protection used for `/admin/events`.

**Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5**

Property 2: Preservation - Existing Navigation, Routes, Gating, and Language Switching

_For any_ navigation interaction where the bug condition does NOT hold (isBugCondition returns false — i.e. the interaction does not target the Tasks feature), the fixed code SHALL produce exactly the same result as the original code, preserving the Events menu and its "Manage events" dropdown, all other nav items (Home, Forum, Documents, AI Oracle, OPCP installations, Users, Configuration) with their routes and admin gating, all existing FR/EN label resolutions, all existing route resolutions and their protection, and the hiding of admin-only entries for non-admin users.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**

## Fix Implementation

### Changes Required

Assuming the root cause analysis is correct, the fix is additive and mirrors the Events wiring exactly.

**File**: `frontend/src/components/Layout.tsx`

**Area**: Desktop menu, mobile menu, and dropdown state.

**Specific Changes**:
1. **Tasks dropdown state**: Add `const [showTasksMenu, setShowTasksMenu] = useState(false);` alongside the existing `showEventsMenu` state.
2. **Desktop Tasks item + dropdown**: Directly after the Events `<div className="relative" ...>` block, add a matching relative container with `onMouseEnter`/`onMouseLeave` toggling `showTasksMenu`, a `<Link to="/tasks">` rendering `t('nav.tasks')` (with the `▾` caret shown only when `isAdmin`), and an admin-gated dropdown containing `<Link to="/admin/tasks">{t('nav.tasks.manage')}</Link>` — identical structure to the Events dropdown.
3. **Mobile Tasks entries**: Directly after the mobile Events `<Link to="/events">` (and its admin `/admin/events` sub-entry), add a mobile `<Link to="/tasks">{t('nav.tasks')}</Link>` and, gated by `isAdmin`, a `<Link to="/admin/tasks">{t('nav.tasks.manage')}</Link>` sub-entry, closing the mobile menu on click like the surrounding entries.

**File**: `frontend/src/i18n/translations.ts`

**Area**: FR translation block and EN translation block.

**Specific Changes**:
4. **French keys**: Add `'nav.tasks': 'Tâches'` and `'nav.tasks.manage': 'Gérer les tâches'` adjacent to the existing `nav.events` / `nav.events.manage` entries.
5. **English keys**: Add `'nav.tasks': 'Tasks'` and `'nav.tasks.manage': 'Manage tasks'` adjacent to the existing EN `nav.events` / `nav.events.manage` entries.

**File**: `frontend/src/App.tsx`

**Area**: Imports and the `/*` route table.

**Specific Changes**:
6. **Import the page**: Add `import { AdminTasksPage } from './pages/AdminTasksPage';` alongside the `AdminEventsPage` import. If `AdminTasksPage` does not yet exist, create it per the `manage-tasks` design so the route resolves.
7. **Register the route**: Add `<Route path="/admin/tasks" element={<ProtectedRoute><AdminTasksPage /></ProtectedRoute>} />` directly after the existing `/admin/events` route, using the identical `ProtectedRoute` protection.

## Testing Strategy

### Validation Approach

The strategy is two-phase: first surface counterexamples proving the Tasks wiring is absent on the current (unfixed) code, then verify the fix wires Tasks like Events and that all existing navigation, routes, gating, and language switching are preserved.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the missing wiring BEFORE implementing the fix, and confirm the root cause (absent nav item, absent translation key, absent route). If any test unexpectedly passes on unfixed code, re-hypothesize.

**Test Plan**: Render `Layout` (desktop and mobile) as an authenticated user and as an authenticated admin, assert on the presence of a Tasks item and "Manage tasks" dropdown; assert `t('nav.tasks.manage')` resolves in FR and EN; render the app router at `/admin/tasks` and assert the Tasks admin page renders. Run these against the UNFIXED code to observe failures.

**Test Cases**:
1. **Desktop Tasks item (authenticated)**: Assert a "Tasks" nav item renders alongside Events (will fail on unfixed code).
2. **Admin "Manage tasks" dropdown**: As admin, assert hovering Tasks reveals a "Manage tasks" link to `/admin/tasks` (will fail on unfixed code).
3. **Mobile Tasks entries**: Open the mobile menu and assert a "Tasks" entry, plus an admin "Manage tasks" sub-entry to `/admin/tasks` (will fail on unfixed code).
4. **Translation key resolution**: Assert `t('nav.tasks.manage')` returns "Gérer les tâches" (FR) and "Manage tasks" (EN) (will fail on unfixed code).
5. **Route resolution (edge case)**: Navigate to `/admin/tasks` and assert the Tasks admin page renders under `ProtectedRoute` (will fail on unfixed code).

**Expected Counterexamples**:
- No element with the Tasks label is found in the desktop or mobile nav.
- `t('nav.tasks.manage')` does not resolve to a defined label.
- `/admin/tasks` renders nothing (no matching route).
- Possible causes: missing `Layout.tsx` markup/state, missing `translations.ts` keys, missing `App.tsx` route/import.

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed navigation behaves like Events.

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  result := renderNavigation_fixed(input)
  ASSERT expectedBehavior(result)
  // Tasks item present; admin sees "Manage tasks" -> /admin/tasks;
  // mobile Tasks + admin sub-entry present; nav.tasks.manage resolves FR/EN;
  // /admin/tasks renders AdminTasksPage under ProtectedRoute
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed navigation produces the same result as the original.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT renderNavigation_original(input) = renderNavigation_fixed(input)
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation because:
- It generates many combinations of auth state (authenticated / not), admin state (admin / non-admin), language (FR / EN), and target route across the input domain.
- It catches edge cases manual tests might miss (e.g. non-admin must not see either "Manage events" or "Manage tasks").
- It gives strong assurance that every non-Tasks nav item, label, and route is byte-for-byte unchanged.

**Test Plan**: Capture the current (unfixed) rendered nav items, resolved labels, and route outcomes for non-Tasks interactions, then write property-based tests asserting the fixed code reproduces them identically.

**Test Cases**:
1. **Events preservation**: Observe the Events menu + "Manage events" → `/admin/events` dropdown (desktop and mobile) on unfixed code, then assert it is unchanged after the fix.
2. **Other nav items preservation**: Observe Home, Forum, Documents, AI Oracle, OPCP installations, Users, Configuration with their routes and admin gating, then assert unchanged after the fix.
3. **Language switching preservation**: Observe FR↔EN resolution of all existing nav labels (including `nav.events` / `nav.events.manage`), then assert unchanged after the fix.
4. **Existing route preservation**: Observe `/admin/events` and other existing routes rendering under their protection, then assert unchanged after the fix.
5. **Admin-gating preservation**: Observe that a non-admin authenticated user sees no admin-only dropdowns, then assert the same gating (now including "Manage tasks") after the fix.

### Unit Tests

- Render `Layout` as authenticated user / admin / non-admin and assert Tasks item and "Manage tasks" gating (desktop and mobile).
- Assert `t('nav.tasks')` and `t('nav.tasks.manage')` resolve in both FR and EN.
- Assert the `/admin/tasks` route renders `AdminTasksPage` under `ProtectedRoute`, and `/admin/events` still renders `AdminEventsPage`.
- Edge case: non-admin authenticated user sees neither "Manage events" nor "Manage tasks".

### Property-Based Tests

- Generate random combinations of (authenticated, admin, language, target route) and assert Tasks wiring appears exactly when and where Events wiring appears, with the same gating.
- Generate random language sequences (FR/EN toggling) and assert all existing labels plus the new Tasks labels resolve correctly with no regressions.
- Generate route-navigation inputs across the existing route set and assert every non-Tasks route resolves identically to the unfixed code.

### Integration Tests

- Full flow: authenticated admin opens the app, sees Tasks alongside Events, hovers Tasks, clicks "Manage tasks", and lands on the Tasks admin page at `/admin/tasks`.
- Context switching: toggle FR/EN and verify both Events and Tasks labels update correctly while all other nav labels remain correct.
- Regression flow: navigate to `/admin/events` and other existing routes after the fix and confirm they render unchanged under their existing protection.

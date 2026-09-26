# Bugfix Requirements Document

## Introduction

When a user opens a default installation from the prerequisites entry point, the installation-scoped prerequisites view displays only the **Network Checklist** section. The other checklist categories that make up a complete installation prerequisites review — **Core Control Plane**, **CloudStore**, and **VCF** — are not shown.

The entry link for an installation targets a single slug (`network-checklist`), and the installation-scoped page renders exactly one checklist config for that slug. As a result, the other three checklist categories are only reachable by manually editing the URL slug, and there is no navigation surface to reach them. A user reviewing a default installation therefore sees an incomplete set of prerequisites and cannot capture answers for Control Plane, CloudStore, or VCF.

This fix makes opening a default installation display all four checklist categories (Network, Core Control Plane, CloudStore, VCF) instead of Network Checklist alone, while preserving the existing behavior of the static content pages, the auth guard, answer persistence, and the unknown-slug not-found handling.

## Bug Analysis

### Current Behavior (Defect)

When a user clicks a default installation, the prerequisites view renders only the Network Checklist section.

1.1 WHEN a user opens a default installation from the installation list THEN the system navigates to the network-checklist slug and displays only the Network Checklist section
1.2 WHEN the installation-scoped prerequisites view for a default installation is rendered THEN the system omits the Core Control Plane, CloudStore, and VCF checklist sections
1.3 WHEN a user wants to see the Core Control Plane, CloudStore, or VCF checklists THEN the system provides no navigation link to reach them and requires manually editing the URL slug

### Expected Behavior (Correct)

When a user clicks a default installation, the prerequisites view should present all four checklist categories.

2.1 WHEN a user opens a default installation from the installation list THEN the system SHALL display the Network Checklist, Core Control Plane, CloudStore, and VCF checklist sections
2.2 WHEN the installation-scoped prerequisites view for a default installation is rendered THEN the system SHALL render each of the four checklist categories with its own section content (questions, markers, example values, and client answer inputs)
2.3 WHEN a user reviews a default installation THEN the system SHALL make all four checklist categories reachable without requiring manual URL editing

### Unchanged Behavior (Regression Prevention)

Existing behavior for other prerequisites routes and controls must be preserved.

3.1 WHEN a user opens a static content slug (basics or network-flux) THEN the system SHALL CONTINUE TO render the corresponding static content page unchanged
3.2 WHEN a user navigates to an unknown or missing prerequisites slug THEN the system SHALL CONTINUE TO render the not-found ("Page de prérequis introuvable.") message
3.3 WHEN an unauthenticated user requests any prerequisites route THEN the system SHALL CONTINUE TO redirect to the login route via the auth guard
3.4 WHEN an authenticated non-admin member edits a client answer on any checklist THEN the system SHALL CONTINUE TO persist that answer through prerequisitesService scoped to the installation and slug
3.5 WHEN a checklist section is rendered THEN the system SHALL CONTINUE TO show its per-row mandatory/optional markers, example values, comments hints, and read-only versus editable answer inputs according to the user's role

## Bug Condition and Property Specification

### Bug Condition

The bug is triggered when the installation-scoped prerequisites view is opened for a default installation (the entry route), which currently resolves to the single `network-checklist` slug rather than the full set of checklist categories.

```pascal
FUNCTION isBugCondition(X)
  INPUT: X of type PrereqView   // { installationId, entryContext }
  OUTPUT: boolean

  // The default-installation entry point renders one checklist category
  // instead of the full checklist set.
  RETURN X.isDefaultInstallationEntry = true
END FUNCTION
```

### Fix Checking Property

For every default-installation entry view, the rendered output must include all four checklist categories.

```pascal
// Property: Fix Checking - Default installation shows all checklists
FOR ALL X WHERE isBugCondition(X) DO
  result ← renderInstallationPrereq'(X)
  ASSERT renderedCategories(result) = { "Network Checklist",
                                        "Core Control Plane",
                                        "CloudStore",
                                        "VCF" }
END FOR
```

### Preservation Property

For every non-bug view (static content slugs, unknown slugs, unauthenticated access, individual answer persistence), the fixed behavior must match the original.

```pascal
// Property: Preservation Checking
FOR ALL X WHERE NOT isBugCondition(X) DO
  ASSERT renderInstallationPrereq(X) = renderInstallationPrereq'(X)
END FOR
```

**Key Definitions:**
- **F** (`renderInstallationPrereq`): the current view that renders a single checklist config for the resolved slug.
- **F'** (`renderInstallationPrereq'`): the fixed view that renders all four checklist categories for a default installation, while leaving static/unknown/auth/persistence behavior unchanged.

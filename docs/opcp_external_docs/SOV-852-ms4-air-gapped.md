# Jira `SOV-852` — `[MS4][OS] Air-gapped Site Operations`

> Parent: `LVL2-18375` (OPCP – Object Storage Packaging [Q2-Q4FY26]).
> Source-of-truth: [`user-stories/M4-air-gapped.md`](../user-stories/M4-air-gapped.md).

---

## User story

> **As an IT-Admin**, I run and grow the Object Storage Service entirely offline — and own capacity monitoring + hardware ordering — with the responsibility boundaries made explicit.

## Definition of Done

* Service deploys + operates with zero external dependencies (local Harbor, OS/firmware mirrors, offline upgrades, local IdP fallback)
* IT-Admin owns cluster lifecycle + capacity + hardware ordering when disconnected
* Legal/SLA responsibility shift is documented and signed off (OSQ-13)
* Air-gapped runbook validated end-to-end

## In scope (this Epic only — user-story + DoD carrier)

Implementation lives in the M4 work-block Epic linked to `LVL2-18375`:

| Epic | Scope |
|---|---|
| `SOV-862` `[MS4][Air-gapped Operations] Development` | Air-gapped runbook, local mirrors, offline upgrade path, SLA boundary documentation |

## Open blockers

* OSQ-13 — legal/product sign-off on SLA responsibilities when air-gapped

## Links

* Full M4 walk-through: [`user-stories/M4-air-gapped.md`](../user-stories/M4-air-gapped.md)

# Jira `SOV-858` — `[MS2][Business Logic Integration] Development`

> Parent: `LVL2-18375`. User-story Epic: `SOV-850`.
> **Blocked by `SOV-867` (OSQ-03 — BL squad capacity). BL full until June for SNC.**

## Scope

Connect the OS Package to the CloudStore Business Logic for:
* Account activation (IT-Admin enables Object Storage for an Account)
* Quota management (per-account storage quota enforcement)
* Usage / consumption (accumulative GB since last billing run, price-per-GB config)
* Feature flags (per-account S3 feature toggles)

**Approach (per OSQ-03 decision):** CAIM-style BL integration — the BL handles activation, quotas, and usage, not custom logic inside the Package. Mirrors the CB pattern.

## Out of scope

* KMS / encryption — *(M3, `SOV-860`)*
* S3 proxies — *(M3, `SOV-859`)*

## Dependencies

* BL squad (Vincent / Ibrahim) capacity — full until June for SNC; OS starts when resources free up
* SOV-254 Keystone Controller must be live (account = Keystone domain)
* ADR-0050 (Consumption system, WIP) — usage/billing may depend on this

## Links

* OSQ-03 tracking task: `SOV-867`
* BL & IAM deep-dive: [`kb/deep-dives/business-logic-iam/summary.md`](../../../architecture/conceptions/business-logic-iam/summary.md)

# Jira `SOV-851` — `[MS3][OS] SecNumCloud Ready`

> Parent: `LVL2-18375` (OPCP – Object Storage Packaging [Q2-Q4FY26]).
> Source-of-truth: [`user-stories/M3-snc-ready.md`](../user-stories/M3-snc-ready.md).

---

## User story

> **As the platform**, I enforce SecNumCloud requirements — admin/user audience separation, encrypted buckets, audited access — so the product is qualification-ready.

## Definition of Done

* S3 traffic flows through the SNC proxy stack (L2/L3 separation + WAF)
* Admin/user 2-Keystone split is live on top of the M2 chain
* Per-bucket encryption is keyed via OKMS (KMIP)
* Access is audited to LDP/Wazuh
* Florent / SNC team sign-off received

## In scope (this Epic only — user-story + DoD carrier)

Implementation lives in the M3 work-block Epics linked to `LVL2-18375`:

| Epic | Scope |
|---|---|
| `SOV-859` `[MS3][S3 Proxies] Development` | S3 DP proxy groups, reserved-ovh-internal- prefix, L2/L3 audience split + WAF |
| `SOV-860` `[MS3][KMS + Encryption] Development` | OKMS/KMIP integration, per-bucket key management (ADR-0048) |
| `SOV-861` `[MS3][Audit + Observability] Development` | Cluster health + RGW audit logs, LDP/Wazuh feed |

## Out of scope for M3

* Air-gapped operations — *(M4)*
* Cluster lifecycle (add/drain/replace nodes) — *(M4)*

## Open blockers

* OSQ-02 (Keystone topology for SNC) must be resolved before the 2-Keystone split design can start
* GSSNC-411 HLD stub — needs full content before architecture proposal

## Links

* Full M3 walk-through: [`user-stories/M3-snc-ready.md`](../user-stories/M3-snc-ready.md)
* Proxies deep-dive: [`kb/deep-dives/proxies/summary.md`](../../../../opcp-core/architecture/conceptions/proxies/summary.md)
* ADR-0048 (S3 KMS unsealing): [`products/cloudstore/misc/compute-block-on-cloud-store/plans/snc-adr-alignment-2026-05-19.md`](../../compute-block-on-cloud-store/plans/snc-adr-alignment-2026-05-19.md)

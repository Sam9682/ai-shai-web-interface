# **NEW** — `[DOC] Object Storage — Documentation`

> **Epic Link (proposed):** [`LVL2-18375`](LVL2-18375) — OS parent Epic.
> **Assignee:** Eddy Medina *(Jira: Eduardo Medina (EXT))*
> **Driven by:** OS action-plan Phase 0 — missing design inputs that block the architecture proposal.

---

## Goal

Gather and distil the missing design inputs for the Object Storage project into workspace reference docs, unblocking the Phase 1 architecture proposal.

## In scope

- **GSSNC-411 HLD** — pull the High-Level Design doc from Jira (attachments or linked Confluence page), distil into `products/cloudstore/misc/object-storage-on-cloud-store/architecture/gssnc411-hld-summary.md`. Currently a WIP stub; its full content is the main missing input for the architecture proposal.
- **Ceph-RGW sizing reference** — draft `products/cloudstore/misc/object-storage-on-cloud-store/architecture/ceph-rgw-sizing.md` covering: 4-node minimum (1 reserved), replication vs EC 3:2 trade-off, 256 GB RAM / 25 GbE / ≥5 data drives + metadata SSDs, 80% usable capacity cap. Not blocked — brief data already in hand.
- **OVH Local Zones S3 limitations (KB0065306)** — manually capture the feature/limitation table from the OVH support portal (JS-rendered, no API access). This defines the V1 feature parity acceptance list.

## Out of scope

- Architecture proposal itself (Phase 1 of the action-plan — depends on these docs + OSQ-01/02 answers)
- SNC Object-Storage Product Note (separate input, tracked in action-plan)

## Definition of Done

1. GSSNC-411 HLD distilled and registered in `build.py`
2. `ceph-rgw-sizing.md` created and registered in `build.py`
3. KB0065306 captured and registered in `build.py`
4. All three cross-linked from OS `architecture/README.md`

## Dependencies / preconditions

- GSSNC-411 and KB0065306 require manual browser access (not accessible via MCP)

## Links

- Parent Epic: [`LVL2-18375`](LVL2-18375)
- OS action-plan: [`action-plan.md`](../action-plan.md)
- GSSNC-411: [`GSSNC-411`](GSSNC-411)
- KB0065306: [`https://help.ovhcloud.com/csm/en-public-cloud-storage-s3-local-zone-limitations?id=kb_article_view&sysparm_article=KB0065306`](https://help.ovhcloud.com/csm/en-public-cloud-storage-s3-local-zone-limitations?id=kb_article_view&sysparm_article=KB0065306)
- OS blockers: [`tracking/blockers.md`](../tracking/blockers.md)

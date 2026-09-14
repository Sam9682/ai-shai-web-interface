# Jira `SOV-862` — `[MS4][Air-gapped Operations] Development`

> Parent: `LVL2-18375`. User-story Epic: `SOV-852`.

## Scope

* Local Harbor + OS/firmware mirrors: all Package artifacts available offline
* Offline upgrade path for the Ceph cluster (packages, OCI images)
* Local IdP fallback when the management plane is unreachable
* Cluster lifecycle when air-gapped: scale, replace node, upgrade — all without WAN
* Monitoring continuity: cluster health alerting without external services
* SLA boundary definition + documentation (OSQ-13): legal/product sign-off on what we monitor and what we don't when the site is disconnected
* Capacity ordering runbook: how IT-Admin procures additional BM when we can't confirm stock centrally

## Dependencies

* M3 must be complete (SNC compliance before air-gap layer)
* OSQ-13 legal/product sign-off required before DoD is achievable

## Links

* OSQ-13: [`open-questions.md`](../open-questions.md)

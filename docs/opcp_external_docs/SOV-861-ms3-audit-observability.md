# Jira `SOV-861` — `[MS3][Audit + Observability] Development`

> Parent: `LVL2-18375`. User-story Epic: `SOV-851`.

## Scope

* Cluster health metrics: Ceph HEALTH_OK/WARN/ERR surfaced to IT-Admin in CloudStore UI
* Capacity alerting: alert when cluster reaches **80% cap** (the configured hard limit)
* RGW request logging: per-account S3 access logs
* SNC audit feed: RGW + Keystone audit events → LDP / Wazuh
* Per-account usage visibility: GB used vs quota, visible to IT-Admin and end user

## M1 vs M3 split

* M1: basic cluster health + capacity % (enough to operate the cluster; `SOV-854` scope)
* M3: full audit feed to LDP/Wazuh + SNC-grade request logging (this Epic)

## Dependencies

* M2 must be live (accounts exist before per-account usage is meaningful)
* SNC audit requirements: need GSSNC-411 HLD for exact log format + destination

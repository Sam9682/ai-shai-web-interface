# Jira `SOV-859` — `[MS3][S3 Proxies] Development`

> Parent: `LVL2-18375`. User-story Epic: `SOV-851`.

## Scope

S3 dataplane proxy groups for SecNumCloud:
* Per-network S3 consumption endpoints (public vs private access control)
* `reserved-ovh-internal-` bucket-prefix enforcement
* L2/L3 audience separation (S3 admin traffic vs S3 end-user traffic)
* WAF integration (Coraza, matching SNC proxy stack pattern)

**Reuse base:** same SNC proxy stack as CB (Caddy + Coraza WAF + Valkey, hardened Debian 12 VMs). See Proxies deep-dive.

## Scope TBD

* Public vs private S3 consumption endpoint split — V1 vs later (OSQ-06)
* Whether Swisscom-style "customer controls from where + who accesses" lands in M3 or M4

## Dependencies

* M2 must be live (S3 endpoint exists before proxies front it)
* Proxies deep-dive: [`kb/deep-dives/proxies/summary.md`](../../../../opcp-core/architecture/conceptions/proxies/summary.md)

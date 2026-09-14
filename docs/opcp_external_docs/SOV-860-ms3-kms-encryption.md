# Jira `SOV-860` — `[MS3][KMS + Encryption] Development`

> Parent: `LVL2-18375`. User-story Epic: `SOV-851`.

## Scope

Integrate **OKMS** (OVH KMIP key management, owned by the KMS Team) for at-rest encryption:
* Per-bucket encryption key via OKMS/KMIP
* RGW unsealing flow per ADR-0048 (S3 KMS unsealing)
* Per-bucket key scope aligned with SNC requirements

**OKMS ownership:** the KMS Team builds and operates OKMS — it is an external OVH product, not developed by the Storage team. Scope here is the **integration wiring + packaging** only.

## Scope TBD

* KMS in V1 or later (OSQ-07)

## Dependencies

* M2 must be live (Ceph + RGW running, buckets creatable)
* ADR-0048: [`products/cloudstore/misc/compute-block-on-cloud-store/plans/snc-adr-alignment-2026-05-19.md`](../../compute-block-on-cloud-store/plans/snc-adr-alignment-2026-05-19.md)
* OKMS product docs: [`https://docs.ovhcloud.com/de/guides/manage-and-operate/kms/architecture-overview`](https://docs.ovhcloud.com/de/guides/manage-and-operate/kms/architecture-overview)

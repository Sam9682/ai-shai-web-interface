# Jira `SOV-854` — `[MS1][Ceph + RGW] Development`

> Parent: `LVL2-18375`. User-story Epic: `SOV-849`. Owner: **Storage Squad** (Stephan Hohn / Boris Behrens / Zafar Akhtar).

## Scope

* Ceph cluster bring-up: OSD layout, monitor quorum, manager, MDS if needed
* RGW daemon configuration + S3 endpoint
* Default: **3× replication**. EC 3:2 profile available at ≥6 nodes (pool profile is immutable post-create)
* HW spec: 256 GB RAM, 25 GbE, ≥5 data drives + metadata SSDs per node; 80% capacity cap enforced
* RGW→Keystone wiring (6 config params, confirmed by Ibrahim 2026-05-27):
  - `rgw_keystone_url`, `rgw_keystone_api_version`
  - `rgw_keystone_admin_user`, `rgw_keystone_admin_password`
  - `rgw_keystone_admin_project`, `rgw_keystone_accepted_roles`
* RGW admin user **must be created in Keystone at service-enable time** (not on-demand)

## Out of scope

* Keystone deployment — see `SOV-856`
* Secrets handoff (admin credentials → RGW config) — pending OSQ-17 / `SOV-865`
* Per-bucket KMS encryption — see `SOV-860` (M3)

## Dependencies

* `SOV-865` OSQ-17: how do generated RGW admin credentials flow into RGW config?
* `SOV-855` provisioning engine: Ceph bring-up tooling depends on the engine choice (Rook vs cephadm/Ansible)

## Links

* Ceph RGW sizing: [`architecture/ceph-rgw-sizing.md`](../../../../../products/cloudstore/misc/object-storage-on-cloud-store/architecture/ceph-rgw-sizing.md) *(to draft)*
* Storage reuse base: SOV-256 `[MS1][Storage Controller] Development` (CB Block Storage — ~80% same scope per Ibrahim)

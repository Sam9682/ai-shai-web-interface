# Jira `SOV-853` — `[MS1][OS Package] Development`

> Parent: `LVL2-18375`. User-story Epic: `SOV-849`.

## Scope

CloudStore Package scaffolding for Object Storage:
* `cloudstore.yaml` inputs: BM node pool selection, cluster replication config (3× vs EC 3:2)
* Package activation / deactivation lifecycle hooks
* OCI bundle build + publish to Harbor (semver tag)

## Out of scope

* Ceph cluster bring-up — see `SOV-854`
* BM provisioning (Ironic/Neutron) — see `SOV-855`
* Identity/credentials — see M2 Epics

## Child Tasks

| Key | Task | Status |
|---|---|---|
| [`SOV-2009`](SOV-2009-role-flavor-osd-specs.md) | `[MS1][OS Package]` **Role-flavor-matched Ceph OSD specs** — (role, flavor) ↔ disk-topology matrix + per-topology OSD spec templates auto-selected at deploy, across the two OSD-carrying node classes (`flavor_mon_nodes` converged · `flavor_osd_nodes` dedicated; `flavor_oob` excluded). Sub-tasks `SOV-2011` / `SOV-2012`. Drives OSQ-31. | Backlog · Unassigned |
| *(adjacent)* [`SOV-2020`](SOV-2020) | `[OSQ-30]` **OOB node — needed after the POC?** Filed under `SOV-863`, not here, but it re-homes package-level machinery: R1 egress proxy · R2 ingress LB+TLS (⛔ gated on Network Service Beta) · R3 generic S3 CORS. Shares the POC-only floating-IP inputs with `SOV-2019`. | Backlog · Unassigned |
| [`SOV-2019`](SOV-2019-input-variable-cleanup.md) | `[MS1][OS Package]` **Clean up the deploy-time input variables (post-POC)** — 14 of 44 TF variables land on the deployer; reduce to what a user can know. `domain`/`environment` + the 3 `ovh_*` creds → platform-injected · POC-only floating-IP inputs removed · env-specific literals (network UUID, region, BMPOD images) de-hardcoded. ⏳ **After the POC phase.** Zafar watching for the app-cred editability evaluation. | Backlog · Unassigned |

## Dependencies

* `SOV-855` must decide the provisioning engine (OSQ-15) before the Package's day-2 lifecycle hooks can be finalised
* Package schema conventions from [`architecture/cloudstore-service-contract.md`](../../compute-block-on-cloud-store/architecture/cloudstore-service-contract.md) apply (use `control:` / `data:`, `permissions:` plural, etc.)

# Jira `SOV-849` — `[MS1][OS] Install the Object Storage Service`

> Parent: `LVL2-18375` (OPCP – Object Storage Packaging [Q2-Q4FY26]).
> Source-of-truth for the underlying user-story content: [`user-stories/M1-infra-deployment.md`](../user-stories/M1-infra-deployment.md).

---

## User story

> **As an IT-Admin**, I select a pool of ≥4 empty bare-metal nodes and activate the Object Storage Service, so the Package provisions a healthy Ceph + RGW cluster — via the OpenStack API, with no manual Ironic/Ceph work.

## Definition of Done

* IT-Admin activates the Service from the CloudStore UI by selecting ≥4 empty BM nodes
* Package provisions Neutron networking + Ironic/Nova BM flavor → Ceph hosts → golden-image injection
* Ceph cluster shows `HEALTH_OK`; RGW S3 endpoint is live
* Cluster scale-in/out works (add a node, remove a node)
* Basic health + capacity view visible to IT-Admin (cluster fullness %)
* CloudStore Package OCI bundle published to Harbor with semver tag

## In scope (this Epic only — user-story + DoD carrier)

This Epic carries the user-story narrative and acceptance gates. It does **not** carry implementation Tasks.
Implementation lives in the M1 work-block Epics linked to `LVL2-18375`:

| Epic | Scope |
|---|---|
| `SOV-853` `[MS1][OS Package] Development` | cloudstore.yaml inputs, Package lifecycle, OCI bundle |
| `SOV-854` `[MS1][Ceph + RGW] Development` | Ceph bring-up, OSD layout, RGW daemon + S3 endpoint |
| `SOV-855` `[MS1][Provisioning Engine] Development` | BM → Ceph host via Nova/Ironic/Neutron; day-2 scale/heal |

## Out of scope for M1

* Per-account activation, S3 credentials, quotas — *(M2)*
* Dedicated in-package Keystone + federation — *(M2)*
* S3 proxies, KMS/encryption — *(M3)*
* Air-gapped operations — *(M4)*

## Personas

| Tier | Persona | M1 role |
|---|---|---|
| L1 | **Datacenter Operator** | Prerequisite: rack BM, install OPCP Core, bring up CloudStore, ensure Ironic discovers BMs |
| L2 | **IT-Admin** | Primary actor — opens CloudStore, picks the OS Package, selects BM pool, activates |
| L3 | **End User** | Dormant — service exists at platform level; no Account enabled yet |

## Acceptance gates

* `ceph -s` → `HEALTH_OK` on the provisioned cluster
* `s3cmd ls s3://` succeeds against the RGW endpoint from an oss-cp pod
* Scale-out: add 1 node → cluster rebalances cleanly
* IT-Admin sees cluster fullness % in the CloudStore UI

## Open blockers

* `SOV-864` OSQ-15 — provisioning engine decision (Rook vs TF) blocks `SOV-855`

## Links

* Full M1 walk-through: [`user-stories/M1-infra-deployment.md`](../user-stories/M1-infra-deployment.md)
* Project milestones: [`milestones.md`](../milestones.md)
* Open questions: [`open-questions.md`](../open-questions.md)

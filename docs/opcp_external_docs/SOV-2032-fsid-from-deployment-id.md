---
id: object-storage-on-cloud-store/jira-sov-2032-fsid-from-deployment-id
type: jira
diataxis: reference
title: "SOV-2032 — [MS1][OS Package] Derive the Ceph cluster fsid from the CloudStore deployment ID"
owner: sov-copilot
status: draft
publish_target: git
product: cloudstore
---

# Jira [`SOV-2032`](SOV-2032) — `[MS1][OS Package] Derive the Ceph cluster fsid from the CloudStore deployment ID`

> **Type:** Task · **Status:** Backlog · **Created:** 2026-07-29 · **Assignee:** **Jan Stuhlmann**.
> **Epic Link:** [`SOV-853`](SOV-853) `[MS1][OS Package] Development`.
> **Outer parent:** `LVL2-18375`.

---

## Goal

The Ceph cluster fsid is currently a **random UUID** with no relationship to anything. Deriving it from the
CloudStore **deployment ID** — also visible in the CloudStore UI — makes it far easier to relate a running cluster
back to its deployment when debugging.

## Current state — verified 2026-07-29 (`origin/main` @ `0.2.0-alpha.18`)

**The plumbing to control the fsid already exists**, so this is a small change:

| Where | What |
|---|---|
| `modules/ceph/main.tf:134` | `resource "random_uuid" "ceph_fsid" {}` — comment: *"generated once, kept stable in state (a regenerating fsid would …)"* |
| `templates/inventory.ini.tpl` | threaded into the Ansible inventory as `ceph_cluster_fsid` |
| `ansible-library-copy/roles/ceph/tasks/mon.yaml:30` | `cephadm … bootstrap … --fsid {{ ceph_cluster_fsid }} …` — **passed explicitly** |

So the fsid is already ours to choose — nothing needs intercepting or reverse-engineering.

## ⚠️ The one constraint to resolve first

**A Ceph fsid must be a valid UUID** — `cephadm bootstrap` validates `--fsid`. The `deployment_id` variable is
*"Deployment ID of the service hash (provided by the CloudStore)"* and **defaults to `poc`**, which is not a UUID.

**So the deployment ID probably can't be used as the fsid directly.** Its real production format can't be
determined from the code, since `poc` is only a dev placeholder. **Confirm that first** — it decides which option
applies.

## Options

| # | Option | Notes |
|---|---|---|
| **1** | **Pass `deployment_id` straight through** | Only if it's genuinely a UUID in production. Simplest; gives exact equality. |
| **2** | **Derive a deterministic UUID** — `uuidv5(<fixed namespace UUID>, var.deployment_id)` | Terraform has `uuidv5()` built in. Stable, reproducible, collision-safe, 1:1 with the deployment. Not *visually* equal, but recomputable — so fsid→deployment becomes a one-line calculation rather than a state lookup. |
| **3** | **Keep the fsid random; label the cluster instead** | Store the deployment ID in Ceph config / a config-key, and/or in `prometheus_agent`'s `external_labels` (its defaults already show `ceph_cluster_fsid` and `service` merged that way). Meets the debugging goal with **zero risk** to cluster identity. |

**2 and 3 aren't mutually exclusive** — doing 3 as well is cheap.

## Two things worth weighing before changing the fsid scheme

- **The fsid is immutable after bootstrap.** The change affects only *new* clusters, so **the fleet will be
  mixed** — existing clusters keep their random fsid. Any debugging convenience has to tolerate both for a while.
- **The fsid is baked into systemd unit paths** — `/etc/systemd/system/ceph-{{ ceph_cluster_fsid }}@.service.d/`,
  used for the start-timeout override and adjacent to the proxy drop-in in `proxy_settings.yml`. A mismatch
  between the bootstrapped and templated fsid **silently breaks those drop-ins** → verify after the change.

> **📌 The current setup isn't actually *unstable*.** `random_uuid` lives in Terraform state, so the fsid already
> survives re-applies and is recoverable. The real pain is that **state isn't at hand when you're SSH'd into a mon
> node** — which is an argument for option 3 as much as for changing the fsid.

## Definition of Done

1. The **production format of `deployment_id` is confirmed**, and the option chosen accordingly.
2. A new deployment produces an fsid that is **derivable from, or equal to**, its CloudStore deployment ID.
3. The relationship is **documented** so someone on a mon node can get from fsid to deployment ID **without
   Terraform state**.
4. The **systemd drop-in paths still resolve** after the change — verified, not assumed.
5. Mixed-fleet behaviour is noted: pre-existing clusters keep their random fsid.

## Links

- Epic: [`SOV-853`](SOV-853) `[MS1][OS Package] Development` ·
  mirror [`SOV-853-ms1-os-package.md`](SOV-853-ms1-os-package.md)
- Related: [`SOV-2019`](SOV-2019-input-variable-cleanup.md) *(`deployment_id` defaults to `poc` — one of the
  POC-baked defaults listed there)* · [`SOV-2030`](SOV-2030-package-documentation.md) *(the fsid↔deployment
  relationship is worth documenting as part of the package docs — DoD #3)*
- Package code: `modules/ceph/main.tf` (`random_uuid.ceph_fsid`) · `modules/ceph/templates/inventory.ini.tpl` ·
  `ansible-library-copy/roles/ceph/tasks/mon.yaml` (bootstrap) ·
  `ansible-library-copy/roles/ceph/tasks/main.yaml` (systemd drop-in paths)

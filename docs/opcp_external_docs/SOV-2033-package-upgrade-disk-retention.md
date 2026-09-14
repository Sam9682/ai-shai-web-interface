---
id: object-storage-on-cloud-store/jira-sov-2033-package-upgrade-disk-retention
type: jira
diataxis: reference
title: "SOV-2033 — [MS1][OS Package] Package upgrade + disk retention on delete (CloudStore lifecycle gaps)"
owner: sov-copilot
status: draft
publish_target: git
product: cloudstore
---

# Jira [`SOV-2033`](SOV-2033) — `[MS1][OS Package] Package upgrade + disk retention on delete — CloudStore lifecycle gaps blocking Object Storage`

> **Type:** Task · **Status:** Backlog · **Created:** 2026-07-29 · **Assignee:** **Jan Stuhlmann** *(taken 2026-09-01)* ·
> **Watcher:** Stephan Hohn.
> **Epic Link:** [`SOV-853`](SOV-853) `[MS1][OS Package] Development` — whose
> declared scope already includes *"Package activation / deactivation lifecycle hooks"*.
> **Outer parent:** `LVL2-18375`.
> **Links (set 2026-09-01):** *is blocked by* [`SOV-2205`](SOV-2205) ·
> *relates to* [`SOV-2204`](SOV-2204) ·
> *relates to* [`SOV-1801`](SOV-1801).

---

## 🆕 Update 2026-09-01 — the CloudStore workstream exists now

**The opening claim below ("CloudStore does not appear to support upgrading a deployed package") was true
when this was filed on 2026-07-29. It is now out of date.** A CloudStore workstream was created
**2026-08-18**, three weeks later, and nothing in this workspace pointed at it until today.

| Ticket | What it is | State |
|---|---|---|
| [`SOV-2205`](SOV-2205) | Epic — *Version upgrade for customer services*. CloudStore UI lets an admin pick a target version and triggers the upgrade via `cloudstore-api`. Reporter Marion Nicole (EXT). **Now linked as *blocks* this ticket.** | Backlog, unassigned |
| [`SOV-2204`](SOV-2204) | Epic — *Backup & restore for customer services*. Named by SOV-2205 as its hard prerequisite ("safety net"), and Gantt-linked to it. | Backlog, unassigned |
| [`SOV-1801`](SOV-1801) | *Automate and secure upgrade workflow of K3s Services* — `csinstall` gains per-service pre/post-upgrade Kubernetes jobs. **This is the mechanism that would carry our `upgrade-ceph` tag.** Priority Critical, label FY27Q1, split from SOV-1774. | Backlog, unassigned |

SOV-2205's six sub-tasks: `SOV-2211` ADR (upgrade flow, pre-checks, rollback strategy, compatibility-matrix
format, backup/restore as the prerequisite gate) · `SOV-2212` product note (**Florent Thiery** — the only
assigned ticket across both epics) · `SOV-2213` compatibility-matrix format + packager guidelines ·
`SOV-2214` reference implementation on `cloudstore-service-helloworld` · `SOV-2215` UI upgrade button ·
`SOV-2218` `cloudstore-api` implementation.

### 🔴 Two findings that change our scope

**1. Backup/restore is package-owned work, not a platform feature — but its scope is undefined.**
SOV-2204 states the ownership outright:

> *"Because each service's data/state differs, backup/restore logic lives on the customer-service side (its own
> terraform plan/API), not as a generic CloudStore mechanism — cloudstore-ui only triggers it and surfaces
> status."*

So the platform supplies a **button and a status surface**, and OS must implement **some** backup/restore hook
to consume the upgrade path at all. **What that hook must cover is written nowhere** — it is precisely the job
of `SOV-2207` (*"scope (what's backed up, RPO/RTO expectations, limits)"*) and `SOV-2208` (packager
guidelines), both unwritten and unassigned.

> ⚠️ **Corrected 2026-09-01.** An earlier version of this note claimed this hook *is* [B2](../alpha-exit-blockers.md)
> and that "B1 now depends on B2". **That was an inference, not a finding** — nothing in SOV-2204/2205 says so.
> Jan flagged the conflation the same day. **Three separable things:** *(1)* the platform contract — trigger +
> status only; *(2)* the OS-side hook — scope TBD; *(3)* B2 — control-plane backup, a live data-loss risk
> **whether or not upgrade ever ships**.

**Where they probably do intersect**, and it is the part worth arguing from: the S3 *object data* is not
meaningfully backup-able — at the ≥4-node target there is no second system to back it up to, and durability
comes from 3× replication or EC 3:2. What is backup-able is **Ceph cluster metadata** (mon store, CRUSH map,
pool definitions, cephadm spec), **RGW user/bucket metadata**, and the **control-plane state** (Keystone CNPG
Postgres, K3S etcd, OKMS keys). And **losing the OKMS keys makes every object unrecoverable while all OSDs stay
healthy** — so a "Ceph-only" backup that skipped the control plane would not actually protect the S3 data.

**→ ✅ Asked 2026-09-01** — comment posted on [`SOV-2204`](SOV-2204)
(the backup epic — where `SOV-2207`/`SOV-2208` actually define scope; it first went to SOV-2205 by mistake,
which now carries a pointer) addressed to **Florent Thiery** (assignee of `SOV-2212`, and the contact now that Marion Nicole — reporter of
both epics — is no longer on the project). Florent added as a watcher so the question actually notifies.
**Awaiting his answer.** The comment states what OS needs the hook to cover — Ceph cluster metadata (mon store,
CRUSH map, pool definitions, cephadm spec) · RGW user/bucket metadata · the Keystone CNPG Postgres · the OKMS
keys once [`SOV-2034`](SOV-2034) lands — and explicitly rules out the S3
object data, so that a scope definition doesn't land on us as something unimplementable. Three questions
asked: is that the intended scope · is it per-service or a common baseline set by `SOV-2207` · is `SOV-2204`
the better home for the question.

> 📌 **Link direction, for anyone re-checking it:** SOV-2033 reads *is blocked by* `SOV-2205` — SOV-2205 is the
> blocker, SOV-2033 is the blocked ticket. The first attempt was created backwards (SOV-2033 blocking the epic)
> and was corrected 2026-09-01 after Jan spotted it in the UI.

> ⚠️ **Ownership risk surfaced 2026-09-01:** **Marion Nicole reported both SOV-2204 and SOV-2205 and has left
> the project.** Both epics are unassigned, and the only assigned ticket across the twelve is Florent's
> `SOV-2212`. **These epics currently have no owner** — worth naming as a risk in its own right, separately
> from their content.

**2. Disk retention on delete is still unowned.** SOV-2205 delivers upgrade-in-place, which satisfies
**DoD #1** and removes the *need* for delete + redeploy. But neither SOV-2204 nor SOV-2205 says anything about
**DoD #2–#4** — volumes surviving a deployment delete, the retained → reattached path, or a customer-facing way
to delete retained volumes. **If SOV-2205 ships exactly as scoped, deleting an OS deployment still destroys
every OSD.** That half of this ticket has no home and needs one.

### Status reality check

**Every ticket across both epics is `Backlog`, and every one is unassigned except Florent's product note.**
The breakdown is sound and the ADR-before-implementation sequencing is right, but nothing is being built, and
there is no fix version or sprint on any of it. For B1 planning: *"CloudStore has a plan"* is true;
*"CloudStore is working on it"* is not.

---

## ⚠️ Ownership

**This is CloudStore team work.** Tracked here because it **blocks Object Storage**: there is currently no safe way
to move a deployed OS cluster to a newer package version, and no safe way to delete a deployment.

## The problem — two gaps that compound

| # | Gap |
|---|---|
| **1** | **CloudStore does not appear to support upgrading a deployed package.** Moving to a newer package version means deleting the deployment and deploying the new version. |
| **2** | **Deleting a deployment destroys the data.** Deleting the deployment deletes the control plane, which deletes all its resources — every disk, therefore **every OSD**. For a storage cluster that's total data loss. |

**⇒ The only available "upgrade" path is also the thing that must never happen to a storage service.** Object
Storage today has **no data-preserving upgrade path at all**.

## What already works — verified 2026-07-29 (`origin/main` @ `0.2.0-alpha.18`)

**The Ceph-side upgrade is implemented and properly guarded** —
`ansible-library-copy/roles/ceph/tasks/upgrade.yaml`, included from `tasks/main.yaml:90`:

- **Opt-in behind an Ansible tag — the exact tag is `upgrade-ceph`** (`when: "'upgrade-ceph' in ansible_run_tags"`),
  so it never runs unless explicitly requested.
- Detects an in-progress upgrade, defensively parsing `ceph orch upgrade status --format json` *(which returns
  non-JSON when idle)*.
- Reads the image cephadm currently uses, compares, then runs `ceph orch upgrade start --image {{ ceph_container_image }}`.
- **Forward-only**, with a real version comparison: `ceph_running_version is version(ceph_target_version, '<')`.

So in-place Ceph upgrade via Ceph's own orchestrator **already exists and is safe**. **What's missing is the
platform-side trigger** — a way for CloudStore to re-run an existing deployment at a newer package version and pass
that tag, rather than destroy-and-recreate.

The Ceph version is wired to the package version through `ceph_container_image` (default
`quay.io/ceph/ceph:v19.2.3`), so bumping the package version is what should drive the Ceph upgrade.

## 🔴 The disk-retention gap is worse than it looks

**Partial protection already exists — and it doesn't cover the case that matters.**
`modules/node/instance.tf:52`, on each attached block device:

```
delete_on_termination = false # better keep the data
```

That protects against **instance** deletion — Nova won't cascade-delete the volume when the server goes away.
**It does not protect against deployment deletion.** The volumes are separate
`openstack_blockstorage_volume_v3` resources **owned by the deployment's Terraform state**, so destroying that state
deletes the volume resources directly; `delete_on_termination` is never consulted. And there is **no
`lifecycle { prevent_destroy = true }`** anywhere in the package.

> **So that setting gives a false sense of safety.** It reads as though the data is protected — and for
> instance replacement it is — but the delete-the-deployment case, *the one that would be used as an upgrade
> path*, still destroys every OSD volume.

**And `prevent_destroy` is not the fix.** Terraform's `prevent_destroy = true` makes `destroy` **fail with an
error** rather than skip the resource, so it breaks the delete flow entirely instead of retaining disks
gracefully. **Retention has to be a deliberate platform behaviour, not a Terraform guard.**

## What CloudStore needs to provide

1. **Upgrade a deployed package in place** — re-run the existing deployment at a new package version instead of
   destroy-and-recreate, passing through the `upgrade-ceph` tag.
2. **Retain disks on deployment deletion** — OSD-carrying volumes must survive deletion and be left for
   **explicit, separate customer action**. A storage service cannot lose data as a side effect of removing a
   deployment.
3. **A customer-facing path to delete retained disks** — otherwise they accumulate and are billed. Retention
   without a deletion path is its own problem.

## Open decisions

- **Which layer owns retention?** A platform "retain volumes" flag on delete · removing the volumes from Terraform
  state before destroy · or **creating OSD volumes outside the deployment's Terraform ownership** so the deployment
  never owns them. The third is most robust and most invasive.
- **How is the retained → reattached path defined?** Retention only has value if a new deployment can **adopt** the
  existing volumes. Otherwise disks are preserved but unusable — data retention without recovery. **This is the
  part most likely to be underspecified.**
- **Upgrade-in-place or blue/green?** In-place matches what the Ansible role already does and is the only option
  preserving data on the same disks. Blue/green needs the reattach story *plus* double the hardware.
- **What's the rollback story?** Ceph orchestrated upgrades aren't trivially reversible and OSD on-disk format
  changes can be one-way. State it rather than assume it. *(`SOV-1829` / `SOV-1831` cover reversibility + rollback
  in the CloudStore packaging framework — worth checking whether it can express "this task is not reversible".)*
- **Version-skew policy?** Can a deployment jump several package versions at once, or must upgrades be sequential?
  Ceph itself constrains this.

## Definition of Done

1. CloudStore can upgrade a deployed OS package without destroying the deployment, with `upgrade-ceph` passed
   through.
2. Deleting a deployment leaves OSD-carrying volumes intact — **proven by test**, not asserted.
3. Retained volumes can be **adopted by a subsequent deployment**, or the alternative recovery path is documented.
4. A customer-facing way to delete retained volumes exists.
5. Rollback and version-skew policies are written down.
6. The misleading `delete_on_termination = false` comment is corrected or amplified, so nobody reads it as
   protecting against deployment deletion.

## Links

- Epic: [`SOV-853`](SOV-853) ·
  mirror [`SOV-853-ms1-os-package.md`](SOV-853-ms1-os-package.md)
- **Adjacent CloudStore framework work:** [`SOV-1829`](SOV-1829) +
  [`SOV-1831`](SOV-1831) *(rollback / reversibility in the packaging framework)* ·
  [`SOV-1801`](SOV-1801) *(Automate + secure upgrade workflow of K3s Services,
  Epic, FY27Q1)*
- Related OS tickets: [`SOV-1448`](SOV-1448) +
  [`SOV-1435`](SOV-1435) *(apt-level upgrade — a different layer of the same
  lifecycle question)* · [`SOV-2031`](SOV-2031-airgapped-apt.md) *(an upgrade in an air-gapped site needs both)* ·
  [`SOV-2019`](SOV-2019-input-variable-cleanup.md) · [`SOV-2032`](SOV-2032-fsid-from-deployment-id.md) *(fsid
  stability across a re-deploy is part of the reattach story)*
- Package code: `ansible-library-copy/roles/ceph/tasks/upgrade.yaml` + `tasks/main.yaml:90` *(the `upgrade-ceph`
  tag)* · `modules/node/instance.tf` *(volume creation + `delete_on_termination`)* · `modules/ceph/variables.tf`
  *(`ceph_container_image`, `ceph_osd_volume_size`, `volume_type`)*

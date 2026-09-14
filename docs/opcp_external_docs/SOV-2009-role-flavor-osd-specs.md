---
id: object-storage-on-cloud-store/jira-sov-2009-role-flavor-osd-specs
type: jira
diataxis: reference
title: "SOV-2009 — [MS1][OS Package] Role-flavor-matched Ceph OSD specs"
owner: sov-copilot
status: draft
publish_target: git
product: cloudstore
---

# Jira [`SOV-2009`](SOV-2009) — `[MS1][OS Package] Role-flavor-matched Ceph OSD specs`

> **Type:** Task · **Status:** Backlog · **Created:** 2026-07-29 · **Assignee:** Unassigned — technical owners
> **Jan Stuhlmann · Boris Behrens** (per OSQ-31).
> **💡 Original idea: Stephan Hohn** — wire OSD spec files to OpenStack flavors.
> **Epic Link:** [`SOV-853`](SOV-853) `[MS1][OS Package] Development`
> *(sole child)*. **User-story Epic:** [`SOV-849`](SOV-849). **Outer parent:**
> `LVL2-18375`.
> **Sub-tasks:** [`SOV-2011`](SOV-2011) ·
> [`SOV-2012`](SOV-2012).
> **Driven by:** OSQ-31 *"OSD Spec — tighten for production"* + its draft answer
> [`architecture/ceph-rgw-osd-spec.md`](../architecture/ceph-rgw-osd-spec.md) (2026-07-16). That draft specifies
> **one** production OSD spec; this ticket generalises it to **one spec per role flavor**, selected
> automatically at package-deploy time.
> **🔄 Revised 2026-07-29** against the [package re-survey](../architecture/object-storage-package-survey-2026-06-10.md)
> — the original "single `flavor_name`" premise is obsolete, and the shipped default spec turned out to be the
> *loose* one. See *Verified package state* below.

---

## TL;DR

> *Added to the Jira description by Jan Stuhlmann, 2026-07-29 — mirrored here.*

The Ceph orchestrator acquires free disks based on **"OSD specs"** — a file describing the properties a disk
must have to be acquired as an OSD and become part of the Ceph cluster. Properties are for example the disk
type (rotational or flash). **Disks always have to be empty — independent of the spec.**

Currently the package ships different OSD spec files which have to be wired by input variable **manually**
(there is not even a list to choose from). This only works for our POC. **Stephan Hohn** had the idea of wiring
OSD spec files to OpenStack flavors. This is what needs to be implemented:

- Define OpenStack flavors with specific disk layouts
- Wire those flavors to OSD spec files
  - Create OSD spec files
  - Ship them with the package
  - Map flavor ↔ OSD spec file
- **Bonus:** make the valid flavors selectable in the **CloudStore UI** *(eventually out of Packager-Team scope)*

> **📌 Mechanical precondition worth keeping in view:** because cephadm only ever takes **empty** disks, the
> loose spec cannot claim a disk that already carries an OS or data. That **narrows gap G3** in the
> [OSQ-31 analysis](../architecture/ceph-rgw-osd-spec.md) — the realistic failure of the take-every-disk spec is
> *any spare empty disk being pulled in with the wrong device class, no `block.db` offload and no encryption*,
> rather than the boot device being eaten out from under a running system. The fail-closed requirement still
> holds on those grounds; **G3's severity rating in the OSQ-31 doc likely needs re-rating from 🔴 to 🟡** when
> Boris + Jan review it (an OSQ-31 follow-up, not a change to this ticket's scope).

## Goal

The Ceph OSD layout is a function of a node's **disk topology**, and the disk topology is a function of the
**Nova bare-metal flavor** the package provisions that node with. Today the spec file and the flavors are wired
independently and manually, so nothing guarantees the OSD spec matches the hardware it lands on.

This ticket makes the relationship explicit and automatic: declare the disk topology behind each **role
flavor**, author a **matching OSD spec per topology**, and have the package **select the right spec at deploy
time** — with no operator input beyond picking the flavors.

This is the implementation half of OSQ-31: the draft doc supplies the *shape* of a correct production spec
(device classes, size bands, `block.db` offload, encryption); this ticket supplies the *mechanism* that picks
the right one and the per-topology parameter sets.

## Verified package state — 2026-07-29 (`origin/main` @ `75497e8`, `0.2.0-alpha.18`)

> **This supersedes the original filing, which assumed a single `flavor_name`.** Ceph node roles are now split
> (commit `b4c3ffd`):

| Variable | Role | Carries OSDs? |
|---|---|---|
| `flavor_oob` | OOB jumphost (egress proxy + ingress LB), exactly 1 | **No — must never get OSDs** |
| `flavor_mon_nodes` | **Converged** nodes — mon/mgr/**osd**/rgw | **Yes** |
| `flavor_osd_nodes` | **Dedicated osd-only** nodes | **Yes** |
| `mon_node_count` | Converged mon nodes; excludes the OOB jumphost. Odd count recommended for quorum. | — |
| `osd_node_count` | **TOTAL** osd nodes — the first `mon_node_count` of these *are* the converged nodes; the remainder are dedicated osd-only. Excludes the OOB jumphost. | — |
| `flavor_name` | **Now the k3s node only** — no longer the Ceph hosts | No |

**Consequence: there are TWO distinct OSD-carrying node classes**, each with its own flavor and therefore
potentially its own disk topology. The deliverable is a **(role, flavor) → OSD spec** mapping, not one spec per
cluster. A converged mon/mgr/osd/rgw node and a dedicated osd-only node can legitimately differ in drive count
and layout, and the CRUSH failure-domain picture differs with them.

**⚠️ The default spec got worse, not better.** `ceph_osd_spec_file` now defaults to
**`../templates/osd-test-single-spec.yml.j2`** — the *loose take-every-disk* spec — with the block-hybrid
default explicitly commented out. At the 2026-07-16 OSQ-31 read the default was the block-hybrid spec. **The
shipped default is now the permissive one** — see *Risk* for what that actually costs on real hardware, and for
the empty-disk bound on gap G3. This *strengthens* the fail-closed requirement rather than weakening it.

Also: `ceph_container_image` defaults to `quay.io/ceph/ceph:v19.2.3`, and the four templates are split across
**two** directories — three under `modules/ceph/ansible-library-copy/roles/ceph/templates/`, and
`osd-test-single-spec.yml.j2` alone under `modules/ceph/templates/` (hence the `../templates/` prefix). Any
selection logic must cope with both paths, or the templates should be consolidated first.

## In scope

- **Role-flavor ↔ disk-topology matrix** — for each of `flavor_mon_nodes` and `flavor_osd_nodes`, the
  authoritative disk layout (HDD count + size · index-flash presence/size/class · DB-NVMe size/count · boot
  device). `flavor_oob` needs only enough detail to prove it is excluded.
- **One OSD spec template per topology**, each closing the [7 gaps](../architecture/ceph-rgw-osd-spec.md) from the
  OSQ-31 draft: explicit `crush_device_class` (G2), size floors clearing the boot disk (G3/G5),
  `db_slots ≥ HDD-count` (G4), `placement: label: ceph-osd` instead of `host_pattern:'*'` (G6),
  `encrypted: true` (G1).
- **Deploy-time selection** — the package derives `ceph_osd_spec_file` from the selected flavors. No manual
  override needed for any supported combination.
- **Fail-closed default** — an unmatched flavor **aborts the deploy with a clear error**. The loose catch-all
  (`osd-test-single-spec.yml.j2`, `data_devices: {all: true}`) is retained **for VM/test topologies only** and
  is never reachable as a silent fallback on bare metal (see *Risk* below). **This is now a change of shipped
  behaviour, since that spec is the current default.**
- **OOB exclusion is verifiable** — G6 is no longer abstract. With `flavor_oob` a distinct role, "no OSD on the
  jumphost" becomes a testable assertion.
- **Verification steps** per topology — the `ceph osd tree` / `crush rule ls` / `pool ls detail` /
  `osd metadata` checks from [§6 Rollout notes](../architecture/ceph-rgw-osd-spec.md).
- **A discoverable list of valid flavors** — today there is "not even a list to choose from"; the supported set
  must be enumerable by an operator, not tribal knowledge.

**Bonus / stretch (per the TL;DR):** surface the valid flavors as a **selectable input in the CloudStore UI**.
⚠️ Flagged as *eventually out of Packager-Team scope* — if it lands outside this team it should become its own
ticket against the CloudStore-UI owners rather than a silent dependency here.

## Out of scope

- **Ceph cluster bring-up itself** — was `SOV-854` `[MS1][Ceph + RGW] Development` (now *Done*; see *Note on
  SOV-854* below).
- **Creating the flavors in OpenStack** — flavors are an OpenStack-side artefact the package *consumes*.
  If flavor creation is OPCP-Core's, that becomes a dependency ticket, not part of this one.
  → [`SOV-2011`](SOV-2011) resolves the ownership.
- **BM host provisioning / Ironic launch code** — `SOV-855` `[MS1][Provisioning Engine] Development`.
- **Node counts + quorum sizing** (`mon_node_count` / `osd_node_count`) — already configurable; this ticket is
  about disk layout, not cluster shape.
- **dmcrypt key custody** (MON config-key store vs OKMS escrow for SNC) — an OSQ-31 open sub-question;
  likely `SOV-1530` `[OS] Security hardening`.
- **Cluster capacity / sizing math** (how many nodes for how much usable TB) — the planned adjacent
  `architecture/ceph-rgw-sizing.md`, distinct from OSD layout.
- **Replica-count derivation** — `SOV-569` covers the analogous auto-derivation for replication.
- **Hardening the Ceph *container* image** (`quay.io/ceph/ceph:v19.2.3`) — OSQ-34 /
  [`SOV-2015`](SOV-2015).

## Definition of Done

1. The role-flavor ↔ disk-topology matrix is documented in
   [`architecture/ceph-rgw-osd-spec.md`](../architecture/ceph-rgw-osd-spec.md) (§4/§5 extended from a single
   spec to a per-role table), covering **both** OSD-carrying classes, reviewed by Boris + Jan.
2. For **every** supported topology there is a committed OSD spec template in the package repo, and each one
   sets `crush_device_class` explicitly, carries a size floor above the boot device, has
   `db_slots ≥ HDD-count`, targets `label: ceph-osd`, and sets `encrypted: true`.
3. Deploying with supported flavors produces the correct OSD layout **without specifying
   `ceph_osd_spec_file`** — only the flavors are chosen. *(Acceptance wording mirrors `SOV-569`: "and that
   without any need to specify it".)*
4. Deploying with an **unsupported / unmatched** flavor fails fast with an actionable error — it does **not**
   fall back to `all: true`. **Note this means changing the current shipped default.**
5. **The supported flavors are discoverable** — an operator can list them without reading the Terraform.
6. **No OSD is ever placed on the `flavor_oob` jumphost**, demonstrated by `ceph osd tree`.
7. `ceph_object_storage = true` is set on every OS deploy path, so the `crush.yaml` + `rgw-pools.yaml` tasks
   actually run *(today a separate manual flag — `ansible-library-copy/roles/ceph/defaults/main.yaml` ships
   `ceph_object_storage: false`)*.
8. Post-deploy verification passes on at least one **real-hardware** topology: `ceph osd tree` shows the
   intended device classes, both CRUSH rules exist, `.data`→`replicated_hdd` and index/meta→`replicated_ssd`,
   and `ceph osd metadata` shows `bluefs_db_*` on NVMe with `encrypted=1`.

## Dependencies / preconditions

- 🔴 **Hardware facts per role flavor** — the [6-item checklist in §5](../architecture/ceph-rgw-osd-spec.md) (HDD
  count, HDD size, DB-NVMe size/count, index-flash class, boot device model/size, encryption policy) must be
  confirmed for `flavor_mon_nodes` **and** `flavor_osd_nodes` separately. The size bands and `db_slots` in the
  draft encode **one** specific topology; the structure is reusable, the numbers are not.
  → [`SOV-2011`](SOV-2011)
- 🔴 **Encryption is create-time and immutable** — `encrypted: true` has to be right *before* the first
  production OSD exists. Converting later means drain → destroy → re-create.
- 🟡 **Flavor ownership** — whether the package or OPCP-Core defines/creates the BM flavors
  ([`SOV-2011`](SOV-2011)).
- 🟡 **OSQ-31 review** — the draft answer doc is still pending Boris + Jan sign-off.

## Sub-tasks

| Key | Sub-task | Suggested owner | Status |
|---|---|---|---|
| [`SOV-2011`](SOV-2011) | Define the **role-flavor** ↔ disk-topology matrix (`flavor_mon_nodes` + `flavor_osd_nodes`, `flavor_oob` excluded); settle who owns flavor creation (package vs OPCP-Core) | Boris Behrens | Backlog · Unassigned |
| [`SOV-2012`](SOV-2012) | Author the per-topology OSD spec templates + deploy-time auto-selection + fail-closed default *(blocked by `SOV-2011`)* | Jan Stuhlmann | Backlog · Unassigned |

> **Both sub-tasks were revised 2026-07-29** with the verified package state — SOV-2011 now enumerates the three
> role flavors and asks whether the two OSD-carrying classes should deliberately share one topology (a valid
> outcome that would shrink SOV-2012); SOV-2012 now records the two template directories and that fail-closed is
> a behaviour change.

## Risk — the take-every-disk spec is the *current shipped default*

The loose spec (`osd-test-single-spec.yml.j2`, `data_devices: {all: true}`, `host_pattern: '*'`) is harmless on
test VMs with one clean data disk per node. On real hardware it gives **no device-class control** (so
`replicated_ssd` matches zero OSDs and the RGW index/meta pools strand with `unknown`/`inactive` PGs), offloads
**no `block.db`** to flash, and leaves data **unencrypted at rest**.

**As of `0.2.0-alpha.18` this is the default value of `ceph_osd_spec_file`** (the block-hybrid default is
commented out) — so the risk is live, not hypothetical, and DoD #4 is a *behaviour change* to be called out in
release notes rather than a pure addition.

**Bounded by the empty-disk precondition** *(see the TL;DR)*: cephadm only ever takes empty disks, so the loose
spec cannot claim a disk already carrying an OS or data. The realistic failure is **a spare empty disk pulled in
with the wrong device class, no `block.db` offload and no encryption** — *not* the boot device being taken from
a running system. [Gap G3](../architecture/ceph-rgw-osd-spec.md) is rated 🔴 High on the stronger reading and
**likely warrants re-rating at the Boris + Jan review** *(an OSQ-31 follow-up, not a change to this scope)*.

→ Hence DoD #4: the catch-all must be an **explicit test-topology opt-in**, never a silent fallback.

## Note on `SOV-854`

[`SOV-854`](SOV-854-ms1-ceph-rgw.md) `[MS1][Ceph + RGW] Development` declares "OSD layout" in scope and is the
epic the OSQ-31 doc cross-references — but it is marked **Done** while this implementation work is still open.
Filing here under `SOV-853` (open, and the owner of package-deployment wiring) avoids reopening a closed epic.
**Open action — confirm with Eddy** which epic new Ceph-layout work should land under going forward.

## Links

- Parent Epic: [`SOV-853`](SOV-853) `[MS1][OS Package] Development` ·
  mirror [`SOV-853-ms1-os-package.md`](SOV-853-ms1-os-package.md)
- User-story Epic: [`SOV-849`](SOV-849) `[MS1][OS] Install the Object Storage Service`
- **Architecture context (required reading):** [`architecture/ceph-rgw-osd-spec.md`](../architecture/ceph-rgw-osd-spec.md)
  — the OSQ-31 draft production spec + 7-gap analysis
- **Package state evidence:** [`architecture/object-storage-package-survey-2026-06-10.md`](../architecture/object-storage-package-survey-2026-06-10.md)
  — read the **2026-07-29 re-survey delta** for the role-flavor split, the OSD-spec default, and the template
  directory layout
- Related: [`SOV-569`](SOV-569) *Update ceph replica configuration depending
  on the architecture* — same auto-derivation pattern, reuse its acceptance wording ·
  [`SOV-855`](SOV-855) provisioning engine (flavor origin) ·
  [`SOV-1530`](SOV-1530) `[OS] Security hardening` (encryption / key custody) ·
  [`SOV-854`](SOV-854) superseded OSD-layout scope
- Open questions: OSQ-31 *(the driver — needs widening to per-flavor, or a new OSQ-34)* ·
  OSQ-04 *(Nova BM flavor → Ironic, decided 2026-05-21)*
- Decision driving this: [`decisions.md`](../decisions.md) 2026-06-09 — CephADM + Ansible, no Rook
- Package code: `cloudstore-service-object-storage` @ `terraform/controlplane/modules/ceph/…/roles/ceph/`
  (templates `osd-*-spec.yml.j2`; tasks `osd.yaml` · `crush.yaml` · `rgw-pools.yaml`)

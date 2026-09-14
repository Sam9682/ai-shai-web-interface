# CLAUDE.md — Object Storage on CloudStore project

> **Project-specific instructions + current state.** Read after the [root `CLAUDE.md`](../../../../CLAUDE.md). Mirrors the [CB](../compute-block-on-cloud-store/CLAUDE.md) / [NS](../network-service-lb-l3-gateways/CLAUDE.md) pattern. The project is in **architecture + early-testing phase** (not yet in-flight delivery).

---

## What this project is

Ship **S3-compatible Object Storage** (backend **Ceph RGW**) as a **standalone CloudStore Service Package** on OPCP Core — the **second** Service after [Compute & Block](../compute-block-on-cloud-store/README.md). Feature target = **OVH Public-Cloud Local-Zone S3 parity**.

**Core principle (OSQ-10):** reuse as much of SNC as possible — package what SNC already has, automate what's still manual. Same value-add pattern as CB.

**Parent Jira:** [`LVL2-18375`](LVL2-18375) (Vincent Casse) · HLD stub [`GSSNC-411`](GSSNC-411). **Target ≈ end-July 2026** (slipped from 6-Mar; Jira confidence *Low*).

## How it's built (load-bearing facts)

- **The Package does everything (OSQ-01):** IT-Admin selects a pool of **≥4 empty bare-metal nodes**; the Package provisions the lot **via the OpenStack API** — Neutron networking, Ironic host provisioning (Nova bare-metal flavor, OSQ-04), golden-image injection, then Ceph-RGW bring-up + scale in/out. OPCP-Core hands over **bare servers** only.
- **VCF way, not Infra-API ([ADR 2026-05-27](decisions.md), Marc):** the Package calls the OpenStack API **directly** (OS needs no special privileges, unlike CB). The operator binary can be reused *inside* the Package. **Criterion sharpened 2026-08-28 (Jan):** the real test is *does what the package provisions have to be integrated into the OPCP Core OpenStack?* — **CB yes** (its compute must be set up as a **hypervisor** on Core OpenStack), **OS no** (standalone, end-user-facing). Privileges are downstream of that. **Trigger that would flip it:** OS becoming OPCP-internal too (e.g. **backup S3 for Cinder**) → **OSQ-39**, open. ⚠️ **Cite the ADR, not OSQ-15** — that older citation is wrong (OSQ-15 is *Rook vs ceph-operator*, closed on CephADM); the boundary half is OSQ-01. **The cost of this choice is lifecycle ownership** — no operator means no `preventDestroy`, no CIS phase, no health heartbeat, and it is why [`SOV-2033`](SOV-2033) exists.
- **OpenStack is internal-only:** post-install, Object Storage runs **standalone** (S3 via RGW, not Swift; not an OpenStack service). The OS Ceph cluster is **dedicated**, separate from Block's Ceph.
- **RGW placement (OSQ-16):** RGW runs **on the Ceph bare-metal nodes** (co-located), not in service-CP VMs.
- **Backend sizing:** min **4 nodes** (1 reserved); **3× replication** or **EC 3:2** (EC needs ≥6 for self-heal, profile immutable); dedicated HW (256 GB RAM, 25 GbE, ≥5 data drives + metadata SSDs); 80% usage cap.

## Architecture decided 2026-06-09 (brainstorm — see [`decisions.md`](decisions.md); Eddy's Confluence summary pageId 963474590 = source of record)

- **Ceph deploy = CephADM + Ansible, NO Rook (FINAL).** Ceph stays off Kubernetes (SNC precedent — Nathan: K3S-for-Ceph doesn't scale + shifts maintenance complexity). Closes OSQ-15 + the Ceph-deploy axis of OSQ-04; supersedes the 2026-05-27 Rook+VCF lean.
- **Service control plane = own K3S per package** (Keystone + federation operator + Ceph orchestration + panel/LZM + proxies; CloudStore-UI → TF-runner-pod deploy). **Planning lean only** — the **own-K3S vs shared "Enabler cluster"** choice is a cross-service decision **deferred to the M3 Design Session 2026-06-10** (**OSQ-21**). OS does **not** block on it; bring-up starts now (Boris + Zafar).
- **Auth (OSQ-02):** ONE Keycloak / ONE Keystone / ONE Apache per realm (SNC pattern); standalone Keystone needs its own DB (irobox/SNC TF). Federation operator → test env this week (**SOV-916**, Ibrahim). Governing authz model = [ADR SOV-583 Option 4](../../architecture/adr/adr-sov-583-authz-model.md) — S3 via `s3.{role}` client-roles on per-(service, region) Keycloak clients.
- **OKMS resilience gate (OSQ-22):** SNC-certified OS needs **K3S ≥3 nodes**; enforce min-resilience in `cloudstore.yaml`, block OKMS enablement below the bar (else OKMS loss = permanent data loss).
- **🚨 Blocker:** auth E2E testing needs a **tunnel from the public-cloud test env to Keycloak** — resolve first.
- **⚠️ Bus-factor:** the CephADM / `host-storage` TF + Ansible bricks were authored by **Stephan Hohn** (currently on sick leave). Reuse bricks live in [irobox](https://stash.ovh.net/projects/GOR/repos/irobox/browse) + [snc/terraform-modules](https://stash.ovh.net/projects/SNC/repos/terraform-modules/browse) (`host-storage`, `OpenStack-instance-V2`, Ansible `deploy-K3S`/`K3S-hardening`/`init-flux`).
- **📦 The Service-package repo EXISTS and is real (verified 2026-06-10):** [`cloudstore-service-object-storage`](https://stash.ovh.net/projects/CLOUDSTORE/repos/cloudstore-service-object-storage/browse) — release **0.1.0-alpha.4** (2026-06-02), `cloudstore.yaml` v1alpha2 ("Object-storage"), Go skeleton + docs. **Survey 2026-06-10 ([package-survey](architecture/object-storage-package-survey-2026-06-10.md)):** a real, well-documented **skeleton** (copier template v0.6.2, created 2026-05-26 by Zafar; committers Zafar + Boris) — the alphas are **packaging-pipeline dry-runs** (OCI chain + air-gapped vendoring WORK), the controlplane/dataplane TF are **stubs** (zero resources; Ceph/Keystone/middleware = named TODO modules). **No contradictions with our decisions — the repo is behind them, never against them.** ⚠️ Stale repo doc: `docs/provisioning-approach.md` still marks Ceph-deploy "OPEN" (pre-dates the 06-09 CephADM-FINAL) → Zafar/Boris should update it.

## Stakeholders & ownership

| Area | Owner |
|---|---|
| **Project owner / parent epic** | Vincent Casse |
| **Product Owner (OS)** | Eddy Medina *(Jira account: "Eduardo Medina (EXT)" — same person; canonical name = Eddy)* |
| **Ceph + RGW (Storage Squad)** | Stephan Hohn · Boris Behrens · **Zafar Akhtar** (SRE) |
| **Keystone / federation operator** | Ibrahim Takouna (SOV-916) |
| **CephADM + TF/Ansible reuse (SNC)** | Nathan M |
| **Business Logic dependency** | BL team (full until June — OSQ-03 schedule driver) |

## Open questions worth knowing on first contact

| ID | Why it matters |
|---|---|
| ~~OSQ-15~~ | ✅ **Closed 2026-06-09: CephADM + Ansible, no Rook.** |
| **OSQ-21** | own-K3S vs shared Enabler cluster — was set for the M3 session 2026-06-10, **not handled there** (session = proxy placement only) → **follow-up/escalation needed**; OS continues on the own-K3S assumption. |
| **OSQ-02** | auth flow — 1 Keycloak/Keystone/Apache per realm; admin/user 2-Keystone split still to design (SOV-916). |
| **OSQ-03** | BL capacity is the **schedule driver** — full until June; when does it free up? |
| **OSQ-22 / OSQ-23** | OKMS ≥3-node gate in `cloudstore.yaml` (owner TBD) · chain Ansible into VM-provisioning TF (owner TBD). |

Full list: [`open-questions.md`](open-questions.md) — `OSQ-NN` series.

## Where the canonical content lives

| Topic | Doc |
|---|---|
| **Why this project exists / dashboard** | [`README.md`](README.md) |
| **Decisions** | [`decisions.md`](decisions.md) — KB side, ADR-style, newest at top |
| **Open questions** | [`open-questions.md`](open-questions.md) — `OSQ-NN` |
| **Milestones** | [`milestones.md`](milestones.md) |
| **Architecture / overview** | [`products/cloudstore/misc/object-storage-on-cloud-store/`](overview.md) (KB side: architecture + overview + user-stories) |
| **Meetings** | [`meetings/`](meetings) — e.g. [2026-06-09 architecture brainstorm](meetings/2026-06-09-os-architecture-rook-vs-cephadm.md) |
| **Onboarding** | [`onboarding.md`](onboarding.md) |

## Conventions specific to this project

1. **`OSQ-NN`** for open questions (independent of CB's `Q-NNN` and NS's `NSQ-NNN`). Highest currently **OSQ-38** — next gets `OSQ-39`. *(Always confirm against [`open-questions.md`](open-questions.md) before allocating — this line has drifted before.)* Open-question Tasks in Jira are titled `[OSQ-NN] <question>` and Epic-Link to [`SOV-863`](SOV-863) `[OS] Architecture Decisions + Open Questions` (pattern: SOV-864/865/866/867 · SOV-1938 · SOV-2015).
1a. **Jira docs are `.md`-only in this project (conscious exception, Marc 2026-06-10)** — the OS epics (SOV-849…863 etc.) already live in Jira with their content; the workspace `.md` files are the readable mirrors. **No `.jira` twins are maintained**; generate one on demand only when a description must be re-pasted into Jira (then delete or sync it). This deviates from the root-CLAUDE.md pair convention deliberately.
2. **Decisions log lives on the KB side** ([`products/cloudstore/misc/object-storage-on-cloud-store/decisions.md`](decisions.md)) — ADR-style, date headers, newest at top. Closed OSQs get `~~strikethrough~~ + ✅ Closed YYYY-MM-DD` and stay in the table.
3. **This project spans both repos:** planning/execution under `products/cloudstore/misc/object-storage-on-cloud-store/`, architecture/overview/decisions/user-stories under `products/cloudstore/misc/object-storage-on-cloud-store/`.
4. **`oss-cp`** = the Object Storage service control plane (own K3S, planning lean — OSQ-21).

## Dependency on CB

- OS is the **second** Service on the same Package pattern as CB — reuses the Service/App (controlplane/dataplane) model, the operator binary, and the SNC TF/Ansible bricks.
- Shares the Storage Squad (Stephan + Boris) with CB Block-Storage (SOV-256) — **parallel demand on the same people is a standing risk** (see `action-plan.md`).

## When you (Claude) help here

- **First action:** read this file + the root [`CLAUDE.md`](../../../../CLAUDE.md). Then skim [`README.md`](README.md) + the top OSQs.
- **For decisions:** draft as an ADR entry in the KB-side [`decisions.md`](decisions.md) before any cascade.
- **For new questions:** add to [`open-questions.md`](open-questions.md) with an `OSQ-NN` id + owner + why-it-matters.

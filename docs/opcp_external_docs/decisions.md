---
id: object-storage-on-cloud-store/decisions
type: decision
diataxis: n/a
title: "Decisions log — Object Storage on CloudStore"
owner: sov-copilot
status: approved
publish_target: git
product: cloudstore
---

# Decisions log — Object Storage on CloudStore

> Architectural Decision Record (ADR)-style. New entries go at the **top**. Dated `YYYY-MM-DD`, with **Context · Decision · Consequences · References**. Own `OSQ-` open-question numbering lives in [`open-questions.md`](open-questions.md).

---

## 2026-05-27 · Provisioning API surface = the OpenStack API directly ("the VCF way"), NOT the OPCP Infra API

> ⚠️ **Reconstructed 2026-08-25** from the contemporaneous 2026-05-27 record, not written at the time. The decision itself is Marc Dittmann's and is quoted verbatim below; the **Consequences** section is a later analysis (2026-08-25) of what the choice turned out to cost, and was *not* part of the original call. **Marc should sanity-check the framing** — he is the decider, and the reasoning is attributed to him.
>
> **Why it is being written now:** this is arguably the most structural choice in the package, and until today its entire provenance was a *status note* filed under OSQ-15 — a question about *Rook vs ceph-operator* that has since closed on an unrelated answer. It had no ADR. See *References* for the citation trail that was corrected alongside this entry.

**Decided by:** **Marc Dittmann**, 2026-05-27, confirmed in Webex (Object Storage channel) — **[🔗 the original Webex message](webexteams://im?space=10189660-55e3-11f1-8ad2-6f2488e76939&message=6a4c34f0-59c3-11f1-9504-0fa0b7ecc35c)** *(deep link; opens in the Webex client)*. Restated in [`SOV-855`](SOV-855) and [`SOV-863`](SOV-863).

**Context:** OSQ-01 (Marc, 2026-05-21) had already set the provisioning *boundary* — the IT-Admin selects a pool of ≥4 empty bare-metal nodes and **the Package does everything else**: Neutron networking, Ironic host provisioning via a Nova bare-metal flavor (OSQ-04), golden-image injection, then Ceph-RGW bring-up and day-2 scale in/out. OPCP-Core hands over bare servers only. What that left open was the *interface*: does the Package reach OpenStack **directly**, or go through the **OPCP Infra API** into `oc-cp` the way Compute & Block does? At the time this was live because SOV-256's Storage Controller already builds a Ceph cluster, making operator reuse look attractive (*"object is ~80% the same"* — Ibrahim).

**Decision** — Marc, verbatim from the 2026-05-27 record:

> OS uses the **VCF way** — the Package calls the OpenStack API directly, not via the OPCP Infra API. CB uses the Infra API because Compute + Block need special OpenStack + network privileges; OS does not have that constraint. The operator binary *can* be reused if deployed inside the Package itself (not in OPCP Core).

**So the decision turns on a single criterion: privileges.** Compute & Block needs elevated OpenStack and network privileges, so it is routed through the Infra API; Object Storage does not, so it is not.

### 🔎 Criterion sharpened — 2026-08-28 (Jan Stuhlmann)

**Privileges are the symptom; the root criterion is whether what the package provisions has to become part of the OPCP Core OpenStack.**

> **Use the Infra API when the nodes the package provisions must be integrated into the OPCP Core OpenStack. Use the OpenStack API directly when they must not.**

| | Does its output join OPCP Core OpenStack? | ⇒ Interface |
|---|---|---|
| **CB** | **Yes** — the compute the package provides has to be **set up as a hypervisor on the OPCP Core OpenStack**. It must land in Core's Nova as a usable hypervisor, which is exactly what the operator's Phase-2 *Nova join* does. | **OPCP Infra API** |
| **OS** | **No (today)** — the Ceph/RGW cluster runs **standalone** and is consumed by end users. Nothing of it registers into Core OpenStack (OSQ-11: *"post-install, Object Storage is NOT an OpenStack service"*). | **OpenStack API directly** |

This **does not change the decision** — it explains it, and it makes the two packages' opposite provisioning paths obviously *both correct* rather than an inconsistency to be reconciled. It also supersedes "privileges" as the test to apply to the *next* package: the elevated privileges CB needs are a consequence of having to join Core, not an independent reason.

**The revisit trigger this exposes — new, and not in the original call.** For OS the Infra API would start to make sense **if the object storage were itself integrated into the OPCP Core OpenStack** — the worked example being **using it as the backup S3 target for Cinder**, i.e. OPCP consuming its own object storage.

> ⚠️ **That is still under discussion.** Is the OS package **end-user-only** (the current approach) or **also consumable by OPCP itself**? **If that direction changes, a switch to the Infra API could make sense** — and this ADR would need reopening. Tracked as **OSQ-39**.

*Source: Jan Stuhlmann, 2026-08-28 — a clear statement received on when Infra-API provisioning is the right call. Not yet cross-checked with Marc; the wording above is Jan's reasoning, recorded as-is.*

**Consequences** *(analysis added 2026-08-25 — not part of the original call)*:

- **CloudStore Services otherwise do not touch physical nodes directly.** CB's counterpart decision (2026-05-09d/e) states it explicitly: *"All BM lifecycle goes TF → OPCP Infra API → CRDs → OPCP Infra Operator → Terraform/Ansible provisioner jobs."* OS is the deliberate exception, and that asymmetry is the single largest architectural difference between the two packages — see [`architecture/os-vs-cb-package-architecture.md`](architecture/os-vs-cb-package-architecture.md).
- **🔴 The cost is lifecycle ownership, and it was not what the decision was argued on.** Everything the Infra Operator gives CB for free becomes package-owned for OS: Ironic provisioning, `DEBIAN12-CIS` hardening (Phase 2, ~40 min), node lifecycle, retries and structured status, destroy hooks, the resource-agent health heartbeat, and **`preventDestroy`**.
- **🔴 It is why [`SOV-2033`](SOV-2033) exists.** CB's destroy protection lives on a **CR held by a reconciler that outlives the delete** (verified in `reconciler_delete.go`, operator tag `0.0.14`: no destroy job, tfstate secret preserved for `terraform import` / re-adoption). OS has **no component that survives its own deletion** — every resource is owned by the deployment's Terraform state. This is not a missing feature in the OS package; it is the bill for bypassing the layer where CB solved it. It is also on the **security** path, not only the data path: remediating the 2026-08-19 Ceph CVEs requires an upgrade the package cannot perform.
- **Day-2 lifecycle had to be re-solved.** The three-way option table under OSQ-15 flagged this at the time — pure TF *"must reimplement reconciliation, TF's weak spot"*. The OS-side answer now belongs to [`SOV-855`](SOV-855) `[MS1][Provisioning Engine]`, whose *Done means* already includes *"Node replace: failed node replaced without data loss."*
- **The escape hatch Marc named is still open and still unused:** the operator binary may be reused **inside** the Package. That remains the cheapest route to a reconciler that outlives a delete, and it does not reopen this decision.
- ✅ **Independently re-derived by the code.** The 2026-06-10 package survey found the `openstack` provider already wired with platform-injected application credentials and no Infra-API hop, concluding the problem is *"structurally like VCF, not like Compute & Block."*

**References:**
- **Primary source:** the Webex message itself — `webexteams://im?space=10189660-55e3-11f1-8ad2-6f2488e76939&message=6a4c34f0-59c3-11f1-9504-0fa0b7ecc35c`
- **Primary record in-repo:** [`open-questions.md`](open-questions.md) — *Status 2026-05-27* under OSQ-15 *(the note's original home; see the citation note below)*
- OSQ-01 — provisioning boundary, Marc 2026-05-21 · OSQ-04 — Nova BM flavor, Marc 2026-05-21 · **OSQ-39** — *is OS end-user-only or also OPCP-internal?* (2026-08-28; the trigger that would reopen this ADR) · OSQ-11 — OS is not an OpenStack service post-install
- [`SOV-855`](SOV-855) `[MS1][Provisioning Engine]` · [`SOV-863`](SOV-863) — both restate the confirmation
- [`architecture/object-storage-package-survey-2026-06-10.md`](architecture/object-storage-package-survey-2026-06-10.md) — the code-side re-derivation
- [`architecture/os-vs-cb-package-architecture.md`](architecture/os-vs-cb-package-architecture.md) — the OS↔CB comparison this decision produces
- Confluence: [Object Storage Package Architecture](https://confluence.ovhcloud.tools/spaces/CPO/pages/1022937871/Object+Storage+Package+Architecture) (pageId 1022937871)

> 📌 **Citation note (2026-08-25).** This decision was previously cited as *"OSQ-15 / 2026-05-27"* across the workspace — including the project `CLAUDE.md` and the Confluence page. **That citation is wrong.** OSQ-15 asks *"Cluster orchestration — Rook vs ceph-operator"* and **closed on 2026-06-09 with CephADM + Ansible, no Rook** — nothing about the API surface. The VCF-way note was filed there only because it made the then-live *"Option C (Rook + VCF)"* look like the natural fit; Option C was superseded, the VCF half survived, and the citation outlived its context. `tracking/blockers.md` attributed it to OSQ-01 instead, so the workspace disagreed with itself. **Cite this ADR (and OSQ-01 for the boundary) from now on — not OSQ-15.**

---

## 2026-06-09 · Ceph deploy = CephADM + Ansible — NO Rook

**Decided by:** OS Architecture Brainstorm, 2026-06-09 (Zafar Akhtar · Ibrahim Takouna · Nathan M · Boris Behrens · Eddy Medina · Marc Dittmann). Marked **DONE** in Eddy Medina's official Confluence summary *"OS MN W24 — 2026-06-09 Architecture Brainstorm"* (pageId 963474590, space SOV) — the authoritative source of record.

**Context:** The Ceph-deploy mechanism had been an open three-way choice (cephadm / Ansible / Rook) since 2026-05-21 (OSQ-04), with a Rook lean emerging on 2026-05-27 (k8s-native cert/secret handling) and 2026-06-05 ("Rook manages RGW via CRDs on the K3S"). Nathan brought the decisive SNC operational input: SNC runs **CephADM + Ansible** with no extra Kubernetes layer on the Ceph nodes; K3S is used only for small edge clusters (≤5 nodes). Running Ceph at scale on K3S "shifts the complexity of maintaining a Ceph cluster to maintaining a real Kubernetes cluster."

**Decision:** Object Storage deploys Ceph with **CephADM + Ansible** (the SNC standard) and does **NOT** introduce Rook. CephADM uses the built-in Ceph orchestrator; there is **no Kubernetes layer on the Ceph storage nodes**. Keystone and the rest of the service control plane live in a separate K3S (see the planning-stance entry below), not on the storage nodes.

**Consequences:**
- **Closes OSQ-15** (cluster orchestration — Rook vs ceph-operator) and the **Ceph-deploy axis of OSQ-04**. The non-Ceph-deploy part of OSQ-04 (Nova BM flavor for host provisioning) was already decided 2026-05-21 and is unaffected.
- The OSQ-15 "Option C (Rook + VCF)" lean from 2026-05-27 is **superseded** — Rook is now explicitly rejected.
- Reuses the SNC CephADM + Ansible bricks: `host-storage` Terraform module (Bartosz + Stephan/Stefan), `OpenStack-instance-V2` (VM-spawn, in iRobox), Ansible roles `deploy-K3S` / `K3S-hardening` / `init-flux`. **⚠️ Bus-factor:** these depend on Stephan Hohn, currently on sick leave.
- No Rook operator / CRDs to learn or maintain — reduces operational surface vs the prior lean.

**References:**
- [`meetings/2026-06-09-os-architecture-rook-vs-cephadm.md`](meetings/2026-06-09-os-architecture-rook-vs-cephadm.md)
- [`open-questions.md`](open-questions.md) — OSQ-15 + OSQ-04 (closed), OSQ-21 (new, own-K3S deferral)
- Eddy Medina Confluence summary — *OS MN W24 — 2026-06-09 Architecture Brainstorm* (pageId 963474590, space SOV) — authoritative
- Supersedes the 2026-05-27 OSQ-15 "Option C (Rook + VCF)" emerging direction.

---

## 2026-06-09 · Service control plane = own K3S per package (planning lean — own-K3S-vs-shared-Enabler DEFERRED to June-10 M3 session)

**Decided by:** OS Architecture Brainstorm, 2026-06-09. **The own-K3S-vs-shared-Enabler-cluster choice is NOT final** — it is a cross-service architecture decision deferred to the **M3 Design Session on 2026-06-10**. This entry records OS's current planning lean only.

**Context:** Each OS service instance needs a control plane to host Keystone, the OPCP federation operator, panel/LZM, and proxies (Ceph itself stays off Kubernetes — see the CephADM entry above). Two shapes are on the table: each package brings its **own K3S** (no external dependency), or all packages share a future **"Enabler K3S cluster."** The current lean is own-K3S to avoid an external dependency that could screw up timings — Pierre confirmed VMs + IPs are spawnable on the demo env now, so a K3S rollout via Terraform can start immediately. CloudStore-UI triggers a **TF-runner pod** to deploy.

**Decision (planning stance, NOT final):** Plan OS with its **own K3S service control plane per package** — hosting Keystone + federation operator + Ceph orchestration entrypoints + panel/LZM + proxies; CloudStore-UI → TF-runner-pod deploy. **The own-K3S-vs-shared-Enabler-cluster decision is a cross-service call DEFERRED to the 2026-06-10 M3 Design Session (2-week deadline to confirm).** OS does **not** block on it — work proceeds on the own-K3S assumption and adapts if the M3 session chooses the shared Enabler cluster.

**Consequences:**
- **New open question OSQ-21** tracks exactly this cross-service choice — owner = Architecture session / Marc, needed-by = M3 Design Session 2026-06-10.
- OS K3S bring-up can start now (Boris + Zafar) without waiting for the cross-service decision.
- Auth model confirmed within this control plane: **ONE Keycloak, ONE Keystone, ONE Apache per account/realm** for JWT validation (already running in SNC). Keystone needs its own DB when standalone — covered by the irobox/SNC Terraform modules. Federation operator (Apache config, network policy, HTTP routes) in test deploy this week (SOV-916, Ibrahim). → refines OSQ-02.
- **⚠️ Key dependency / blocker:** auth cannot be end-to-end tested until the public-cloud test env has a **tunnel to Keycloak**. Must resolve before E2E auth testing.

**References:**
- [`meetings/2026-06-09-os-architecture-rook-vs-cephadm.md`](meetings/2026-06-09-os-architecture-rook-vs-cephadm.md)
- [`open-questions.md`](open-questions.md) — OSQ-21 (new), OSQ-02 (refined)
- Eddy Medina Confluence summary — *OS MN W24* (pageId 963474590, space SOV) — authoritative
- SOV-916 — RGW federation operator in test

---

## 2026-06-09 · OKMS resilience gate — SNC-certified OS requires K3S ≥3 nodes, enforced in cloudstore.yaml

**Decided by:** OS Architecture Brainstorm, 2026-06-09 (resilience input from Boris Behrens; gating mechanism from Ibrahim Takouna).

**Context:** OKMS provides object encryption. If the K3S hosting OKMS fails while encryption is enabled, the encrypted data is **permanently lost** — there is no recovery. For SecNumCloud-certified deployments the OKMS-hosting K3S must therefore be highly available.

**Decision:** SNC-certified Object Storage requires the OKMS-hosting **K3S cluster to have ≥3 nodes**. Minimum-resilience requirements are declared and enforced in **`cloudstore.yaml`** — the service **blocks OKMS enablement** if the cluster does not meet the resilience bar (checkbox gating: a customer cannot tick "encrypt all my objects with OKMS" without a compliant cluster). The bare-minimum non-SNC footprint remains just Keystone + one nginx proxy.

**Consequences:**
- New action item: define the minimum-resilience requirements in `cloudstore.yaml` for OKMS (owner TBD — see OSQ-21 sibling note; tracked in the meeting action items).
- Connects to OSQ-07 (KMS / OKMS scope) — adds a concrete resilience requirement.
- Provisioning UX must surface the resilience requirement as a gate, not a silent failure.

**References:**
- [`meetings/2026-06-09-os-architecture-rook-vs-cephadm.md`](meetings/2026-06-09-os-architecture-rook-vs-cephadm.md)
- [`open-questions.md`](open-questions.md) — OSQ-07 (KMS scope)
- Eddy Medina Confluence summary — *OS MN W24* (pageId 963474590, space SOV) — authoritative

---

## 2026-06-02 · Dedicated Keystone, secrets pattern, and RBAC confirmed

**Decided by:** Controllers & Secrets Alignment meeting (Ibrahim Takouna, Pierre-Yves, Guillaume Audic, Boris Behrens, Zafar Akhtar), 2026-06-02.

**Context:** Alignment session called to resolve overlap between CB and OS teams on secrets handling and Keystone architecture.

**Decisions:**

1. **Dedicated Keystone per service confirmed.** OS gets its own Keystone — no shared OPCP Keystone operator. Keystone operator reusable with unused controllers disabled via feature flag. Federation config stays in the data plane.

2. **Secrets pattern confirmed.** OpenStack credentials already exist as a secret in the OCP namespace. Keycloak L3 client ID and secret generated by cluster API on account creation, passed as TF variables to the data plane — same pattern as CB.

3. **RBAC for provisioner.** Permissions live in the service repo as raw manifests, not hardcoded in the Helm chart. The Kubernetes provider inside the TF module needs the permissions, not the pod itself.

**Consequences:**
- OSQ-02 direction confirmed — dedicated Keystone path.
- OSQ-17 partially resolved — secrets pattern known; RGW federation against Keycloak still open (SOV-916).
- OSQ-20 opened — L2/L3 enabler services notification pattern not yet solved.

**References:**
- Meeting notes: [`2026-06-02-controllers-secrets-alignment.md`](meetings/2026-06-02-controllers-secrets-alignment.md)
- Confluence: https://confluence.ovhcloud.tools/pages/viewpage.action?pageId=966958631
- SOV-856, SOV-865, SOV-916

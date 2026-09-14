---
id: compute-block-on-cloud-store/architecture-code-survey-2026-05-11
type: deep-dive
diataxis: explanation
title: "Architecture verification vs. code (2026-05-11)"
owner: sov-copilot
status: approved
publish_target: git
product: cloudstore
---

# Architecture verification vs. code (2026-05-11)

> Survey of the actual `opcp-infra-operator` + `irobox` source against the project docs. **What the code shows, where the docs were wrong, what's greenfield for SOV-256.** Cloned sources live outside this repo — see [`EXTERNAL-REPOS.md`](../../../../../_workspace/EXTERNAL-REPOS.md).

> **🔄 SUPERSEDED IN PART — re-survey 2026-06-23.** The "greenfield" conclusions below have largely been overtaken by code that landed in June. Key deltas (full detail in [`opcp-core-operator.md`](opcp-core-operator.md) ⬆️ notes):
> - **Operator now has 6 reconcilers**, not 2: **Storage** + **StoragePool** (rel. 0.0.11) and **KeystoneDomainFederation (KDF)** + **KeystoneDomainFederationTemplate (KDFT)** (rel. 0.0.10–0.0.12) joined Compute + ComputePool. ⚠️ Keystone ships as **KDF/KDFT with `TemplateRef`**, *not* the assumed `KeystoneDomain`.
> - **iRobox storage support is no longer absent:** `ansible/roles/ceph` (cephadm mon/osd/rgw), `fleet-infra/terraform/modules/hosts-storage`, `…/root-modules/storage`, and Cinder RBD backend wiring are all on `master` + `release/3.1.x`. Only the newest operator-driven Ceph-cluster-deploy (SOV-687) is still on the unmerged `dev/shohn/SOV-687` branch.
> - **Glance multi-backend (file/S3/ceph-rbd)** delivered in iRobox (SOV-474, `release/3.1.x`) — answers Q-610 (sync = `openstack image import --method copy-image` via post-setup TF, *no* daemon).
> - **Treat the sections below as the May-11 baseline**; cross-check against the dated ⬆️ notes before quoting.

---

## What the OPCP Infra Operator actually is

A **single Go binary** (kube-builder + controller-runtime, Go 1.25.5) at `cmd/main.go`. Imports today register exactly **two** controllers:

- `internal/controller/compute` — Compute Controller
- `internal/controller/computepool` — ComputePool reconciler

The binary also bundles:

- `internal/api/` — a **Gin-based REST API** bound to `:8082` (configurable). This is **internal** — it serves the operator's own provisioner jobs (status updates, context lookup) and resource agents (heartbeat). Not customer-facing.
- `internal/webhook/` — admission webhooks for Compute / ComputePool CRDs (validating).
- `internal/fluxcd/`, `internal/certrotator/`, `internal/metrics/`, `internal/terraform/` — supporting packages.

The CLAUDE.md at the repo root names this "the operator"; the README still calls it "OPCP Services Operator" (stale header). The repo is `gor/opcp-infra-operator`; our canonical project name "OPCP Infra Operator" matches the repo, not the README header.

## CRDs that actually exist

Defined in `api/v1alpha1/`:

| CRD | Short | Description |
|---|---|---|
| **`Compute`** | `oc` | One baremetal compute node. Conditions: `Ready`, `Synced`, `Healthy`. |
| **`ComputePool`** | `ocp` | Pool config: FluxCD source + working directory + shared Terraform vars. |

The actual `ComputeSpec` is intentionally generic:

```go
type ComputeSpec struct {
    PoolRef               string                        // required
    SuspendReconciliation bool
    Vars                  map[string]apiextensionsv1.JSON  // opaque, passed to Terraform
    SecretVarRefs         []string                      // K8s Secret names; merged in but never echoed to status
    PreventDestroy        bool
    BreakTheGlass         bool                          // pause provisioner job for kubectl exec debugging
}
```

`ComputePool` is the same shape minus `PoolRef`, plus `SourceRef` (FluxCD GitRepository/Bucket/OCIRepository) and `WorkingDirectory`.

**`StorageNode`, `StoragePool`, `Storage`, `KeystoneDomain` do NOT exist yet** — they are entirely greenfield.

## Reconcile flow (verified from code + CLAUDE.md)

1. A `Compute` CR is applied. The Compute Controller resolves the `PoolRef` → `ComputePool` → `SourceRef` (FluxCD source artifact).
2. Reconciler computes spec/revision hashes; if drift, creates a **Provisioner Job** (`provisioner-apply-{compute-name}`).
3. The Provisioner pod runs in two phases:
   - **Phase 1 — Terraform/OpenTofu** against the working directory in the FluxCD artifact (an iRobox subtree); provisions BM via OpenStack Ironic.
   - **Phase 2 — Ansible**; configures the host (CIS hardening, installs packages, deploys the Resource Agent).
4. Provisioner reports results back via `PATCH /computes/:name/status` on the operator's internal REST API.
5. The **Resource Agent** (deployed in Phase 2) sends a heartbeat every 60 s via public `PATCH /computes/:name/heartbeat`.
6. Reconciler updates `Compute` conditions based on job status + heartbeat freshness.

Persistence:
- Terraform state: K8s Secret `tfstate-default-{compute-name}`
- Vars: K8s ConfigMap `tf-vars-{operation}-{compute-name}`
- Single-Namespace Mode (spec 017) — operator watches only its own namespace.

## What iRobox is

A **template repo** (CLAUDE.md says: "*This is a common base template that generates repositories for control plane deployments*") that ships in three deployment modes:

| Mode | Operated by | Users |
|---|---|---|
| **BM POD SNC** | OVH (full stack) | Cloud tenants |
| **OPCP Managed** | OVH (with customer config knobs) | Customer admins |
| **OPCP Unmanaged** | Customer | Customer ops |

Structure relevant to the operator:

- `fleet-infra/terraform/modules/` — reusable Terraform modules: **`hosts-compute`** (compute node prep), `openstack`, `openstack-infra`, `keycloak-realm`, `chrony`, `extern-dns`, `firmware-server`, `nuc-provisioning`, `cloudstore-provisioning`, `hosts`, `hosts-cloudstore`.
- `fleet-infra/terraform/root-modules/` — entry points: **`compute-vm-hosts-trunk`** (compute), `cloudstore`, `openstack`, `keycloak-post-setup`, `nuc`, `apiproxy`, `firmware-server`, `irobox`, `paas`.
- `ansible/roles/` — `DEBIAN12-CIS` (the 40-min hardening), `compute-vm`, `setup-k3s`, `setup-k3s-cloudstore`, `bootstrap-cloudstore`, `system-prepare`, `wazuh_agent`, `ovh-tools`, etc.
- `hieradata/` — Puppet/Hiera-style hierarchical YAML for variables.
- Templates in `fleet-infra/` use **gomplate with `{()}` decorator** (re-defined to distinguish from Go templates).

**Storage in iRobox: NOTHING.** No `hosts-storage`, no `storage-vm-hosts` root-module, no `ceph-osd` ansible role, no Cinder configuration module.

## Mismatches between docs and code

| Doc claim | Reality | Action |
|---|---|---|
| CRDs are `ComputeNode` + `ComputePool` | CRDs are `Compute` + `ComputePool` | **Rename across docs.** `ComputeNode` is wrong. |
| Compute CR spec has fields `hostname`, `availabilityZone`, `trunkBackendMacAddress` | Spec is generic: `PoolRef` + opaque `Vars` map (those fields live in the Terraform vars passed via `Vars`) | Update the YAML sketch in `architecture/opcp-core-operator.md` to match real spec. |
| ComputePool spec has structured fields `binaries`, `helm_charts`, `federation`, `vars` | Spec has `sourceRef` (FluxCD), `workingDirectory`, opaque `vars`, secrets | Same — fix the YAML sketch. |
| Operator spawns pods named `opcp-provisioner` | Pods are jobs named `provisioner-apply-{name}` / `provisioner-destroy-{name}`. The ServiceAccount is `opcp-provisioner` (that's where the confusion came from). | Clarify in docs: ServiceAccount = `opcp-provisioner`; job names = `provisioner-{op}-{name}`. |
| Terraform state secret: `tfstate-<pool>-<node>` in namespace `deploy-<pool>-<node>-<hash>` | `tfstate-default-{compute-name}` in operator's own namespace | Update. |
| "OPCP Infra API" = the REST shim that cs-cp's TF calls to claim BM nodes | The Swagger URL at rtstatic.ovhcloud.tools/.../opcp-infra-api/ refers to an external-facing REST API that is **not** in this operator repo. The operator's own `internal/api/:8082` is the *internal* callback API for provisioner jobs + resource agents only. | These are two different APIs. Disambiguate in docs. The external one may live in a separate repo we haven't surveyed. |
| Storage Operator is "intended to be sibling controller in the same operator binary" | True intent confirmed, but **not implemented**. No `Storage*` CRDs, no `internal/controller/storage`, no Storage spec in `specs/`. | Doc framing is correct; just stress that this is greenfield. |
| Keystone Operator is "M2 work" | Same — greenfield. | OK as-is. |
| 1-hour provisioning (20 min Debian install + 40 min CIS hardening) | Plausible — `DEBIAN12-CIS` ansible role exists; Debian 12 specifically (not "Debian 11 or 12") | Tighten "Debian" → "Debian 12 + QEMU/KVM" where relevant. |
| Resource agent / heartbeat monitoring | **Not in our docs at all.** | Add: 60s heartbeat from BM node → `PATCH /computes/:name/heartbeat`; drives the `Healthy` condition. |
| Webhooks (admission validation on Compute/ComputePool CRDs) | Exists (`internal/webhook/`); self-signed cert rotated by `certrotator` or cert-manager | Add to docs. |
| OpenStack runs separately from K8s | OpenStack runs **IN** the K8s cluster (per CLAUDE.md: "OpenStack: Runs IN the Kubernetes cluster (in-cluster deployment)") | Significant clarification. Update where docs ambiguous. |
| Generic "OpenTofu" — operator uses tofu specifically | Code uses the term **"Provisioner"** (a generic abstraction that supports Terraform OR OpenTofu). Don't bake tofu-only assumptions in. | Adjust terminology. |
| The `specs/` directory style | Repo uses **speckit** specifications: 17 numbered specs (`001-architecture-overview` … `020-break-glass-debug`) | New context — when adding the Storage Controller, the first artefact is a new `specs/NNN-storage-reconciler/spec.md`. |

## What SOV-256 (block-storage M1) actually entails

Greenfield on three sides:

**Operator (`opcp-infra-operator`):**
- New spec under `specs/NNN-storage-reconciler/spec.md` (per speckit workflow).
- New CRDs in `api/v1alpha1/`: probably `storage_types.go` (Storage / StorageNode — naming follows Compute pattern) + `storagepool_types.go`. Spec shape mirrors Compute (PoolRef + opaque Vars + SecretVarRefs + PreventDestroy + BreakTheGlass).
- New reconcilers in `internal/controller/storage/` and `internal/controller/storagepool/`.
- Wire into `cmd/main.go` alongside existing Compute / ComputePool controllers.
- Generate CRDs, RBAC, webhooks via `task manifests`. Add webhook handler in `internal/webhook/`.
- Add health check / heartbeat handling for storage resources (the resource-agent pattern already generalises).

**iRobox:**
- New module `fleet-infra/terraform/modules/hosts-storage` (parallel to `hosts-compute`): cloud-init userdata + netplan + LVM resize for storage nodes; difference is disk topology (multiple data disks for OSDs) and no Nova compute install.
- New root module `fleet-infra/terraform/root-modules/storage-vm-hosts-trunk` (or similar) — entry point that the operator's StoragePool will reference via FluxCD source + working directory.
- New ansible role `ceph-storage` (parallel to `compute-vm`): install ceph-osd, prep OSD disks, register with mon cluster.
- Cinder backend wiring — extend the existing `openstack` root module to point Cinder at the Ceph cluster (RBD pool, keyring, default backend).

**CloudStore Service package (`cloudstore-vm-bs-service`):**
- Control-plane TF: add `kubernetes_manifest` resources for StoragePool + Storage CRs alongside the existing Compute ones.
- Variables fed through `vars` map: pool name, mon endpoints, OSD disk pattern, replication factor, default-pool name.

## Open items surfaced by the survey

1. **The "OPCP Infra API" at the Swagger URL is not in the operator repo.** Either it's a separate service / repo, or the Swagger documents the operator's internal API on `:8082` (in which case it's named confusingly). Worth pinning down — the CloudStore Service's control-plane TF needs to know what it's calling.
2. **No spec yet for Storage** under `specs/` — the team's own workflow says "every feature/modification requires a spec file first" (CLAUDE.md), so the first SOV-256 work item is to write `specs/NNN-storage-reconciler/spec.md`.
3. **Resource Agent generalisation** — the heartbeat pattern is named "Compute" in code (`/computes/:name/heartbeat`). For Storage we either reuse `/computes/...` semantics, generalise the endpoint, or add `/storages/:name/heartbeat`. The `internal/api/` v1 group uses `/api/v1/:resourceKind/:name/context` which suggests the generic-kind path is the intended direction.
4. **The README header "OPCP Services Operator"** should probably be updated upstream; nothing for us to do.
5. **`PROJECT` file** (kube-builder project manifest) — useful for understanding scaffolding patterns, didn't read yet but worth a glance before adding Storage CRDs.

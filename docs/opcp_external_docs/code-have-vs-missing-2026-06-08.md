# Network Service — Code "have vs missing" gap analysis (2026-06-08)

> **Purpose:** feed the **KW 24 Wednesday-afternoon (2026-06-10) M3+M4 estimation workshop**.
>
> **Scope:** 5 upstream repos surveyed in depth + sampled cloudstore-* family. Repos read read-only outside this repo — see [`kb/EXTERNAL-REPOS.md`](../../../../../_workspace/EXTERNAL-REPOS.md).
>
> **Frame:** the intended user-flow is (1) IT-Admin enables `cloudstore-network-service`, (2) picks ≥2 BM hosts, (3) Infra API + Operator provision, (4) Octavia + Neutron-L3 deploys, (5) tenant creates LBs / Gateways / FIPs.
>
> **Load-bearing decisions in scope** (see [`decisions.md`](../decisions/index.md)):
> - Single combined `cloudstore-network-service` (NSQ-013)
> - **Stay with OVS** for M1–M2 (NSQ-003 re-closed EOD 2026-06-08)
> - **Barbican already available** in OPCP (NSQ-001 closed)
> - **V1 ships without over-commit** (NSQ-006 closed); CPU-pinning: **amphora aggregate OFF / tenant-VM aggregate ON** — **re-corrected 2026-06-10 per current irobox master** (flavors migrated to `ovh.network`, `pinning_enabled: false`, no `hw:cpu_policy=dedicated`; the 2026-06-09 "ON" correction was based on the stale Confluence as-built)
> - **M1 hardware minimum = 2 BM total** (logical aggregate split)
> - **M3 = first SNC qualification** of LB + L3 (no existing SNC LB/L3 product to parity-replicate)
> - **Octavia API rides CB's proxy chain** (NSQ-005 closed) — HTTPRoute in M2, SNC proxy stack in M3
> - **FIP-in-VM-create-form** lives in CB M3 LZM (Model A)
>
> **Cross-refs:** [`code-survey-2026-06-08.md`](code-survey-2026-06-08.md) (the 131-commit triage that surfaced the 6 themes — use as the starting context), [`octavia-from-fdd.md`](octavia-from-fdd.md) (FDD §7.2 distillation).

---

## Methodology

Per layer the survey:
1. Identifies the **CB-pattern interface** for that layer (skim the CB workspace doc).
2. Greps / reads the upstream repo for matching constructs.
3. Classifies findings as:
   - 🟢 **Have** — already built, usable as-is for NS
   - 🟡 **Have but adapt** — exists, needs refactor / parameterization
   - 🔵 **Have for adjacent purpose** — pattern exists but the NS instance doesn't
   - 🔴 **Missing** — nothing exists; would build from scratch

**Uncertainty:** I sampled deeply where Octavia / Neutron / Barbican / aggregate constructs live; I did NOT exhaustively read every cloudstore-* repo's TF. The cloudstore Service-Package layer assessment is therefore based on the existing CB workspace docs + a sampling of the 8 core service repos, not a direct survey.

---

## Executive summary

### Top 5 "Have" (leverageable assets)

1. **🟢 Octavia control-plane K8s deployment** — a complete TF module (`irobox/fleet-infra/terraform/modules/openstack/octavia/`, 2 100 lines of TF) shipping API / Worker / Health-Manager / Housekeeping / Driver-Agent + RabbitMQ + CNPG-PostgreSQL + cert-manager mTLS + HTTPRoute exposure + ingress flavour-profile-creation TF. Already wired in minint (`octavia.enabled: true`).
2. **🟢 Amphora image build pipeline** — already running upstream at `rt.ovhcloud.tools/artifactory/gor-publiccloud-cds-release/.../octavia/<ver>/amphora-x64-haproxy-trixie-*.qcow2` and pulled by Glance via `glance_images` hieradata. No NS-side build to set up.
3. **🟢 Barbican fully wired** — irobox TF module `openstack/barbican/` (API, worker, keystone-listener, CNPG-DB, ingress, KMIP-secret to OVHcloud-kmipapi); already deployed in SNC NUC fleet (`fleet-infra-snc-hieradata/flow-matrix/*` shows full barbican↔kube-apiserver↔ingress-nginx↔barbican-db↔kmipapi NetworkPolicy graph). Octavia just consumes existing service-catalog endpoint.
4. **🟢 Neutron L3-agent stack** — `neutron-l3-agent` DaemonSet TF + config (`router,trunk` service-plugins enabled in `neutron-server.conf`), hardened in recent PRs #684 (OVS-agent init-container) / #703 (API readiness fanout-queue check) / #705 (VLAN-range refactor). Routers + SNAT machinery is in place.
5. **🟢 Nova aggregate machinery + amphora flavour profile TF** — `fleet-infra/terraform/root-modules/compute-vm-hosts-trunk/aggregates.tf` builds `openstack_compute_aggregate_v2` from `os_aggregates` hieradata. `octavia-post-setup/` already provisions S/M/L `openstack_compute_flavor_v2` + `openstack_lb_flavorprofile_v2 (loadbalancer_topology=ACTIVE_STANDBY)` + `openstack_lb_flavor_v2`. Aggregate `ovh.network` with `pinning_enabled: false` flag already exists in `gor-minint.yaml` — exactly the prototype for our L3-services aggregate. **Update 2026-06-10:** per current irobox master, `ovh.network` is now **ALSO the amphora flavors' actual landing aggregate** (`aggregate_instance_extra_specs:ovh.network: "true"` in `octavia_post_setup_vars.yaml`, migrated off `ovh.b3-milan`; pinning extra-specs dropped) — not just the L3 prototype. See NSQ-006 re-correction 2026-06-10.

### Top 5 "Missing" (build-from-scratch or major adapt)

1. **🔴 `cloudstore-network-service` Service Package itself** (XL) — repo + `cloudstore.yaml` + `terraform/controlplane/` + `terraform/dataplane/` + docker_images registration + OCI build pipeline. Pattern is settled (CB `cloudstore-vm-bs-service` skeleton); NS has to do the work.
2. **🔴 Network-Service reconciler(s) inside `opcp-infra-operator`** (L) — operator today has **only** `Compute` + `ComputePool` CRDs (`api/v1alpha1/`, `internal/controller/{compute,computepool}/`). Zero LB / Octavia / Neutron / Barbican refs in the operator. NS would add `NetworkServicePool` (or `OctaviaPool` + `L3GatewayPool`) CRDs + reconcilers.
3. **🔴 Floating-IP + External-network + Router-as-API surface** (L) — no TF resources for `openstack_networking_floatingip_v2`, `openstack_networking_router_v2`, or `openstack_networking_network_v2` of the *external* / *provider* kind anywhere in irobox today. Brief explicitly asks for FIP allocation + L3 router-create on tenant side, and this surface must be exposed via NS-API. (The existing `lb_mgmt` network in `octavia/` root-module is a mgmt VLAN, not a tenant external network.)
4. **🔴 SNC fleet enablement for Octavia** (M) — `fleet-infra-snc-hieradata/hieradata/prod/{snc-rbx,snc-sbg,snc-gra}-nuc*.yaml` carry **no `octavia:` key**. Octavia today only lives on minint / dev — never deployed in an SNC NUC, never SNC-qualified. M3 = first qualification = this whole gap is M3 work.
5. **🔴 Octavia-flavour ↔ NS-API translation + sizing exposure** (M) — FDD ships 3 amphora flavours (S/M/L); brief proposes throughput tiers (200/500/2G/4G). NSQ-002 still open. The Infra-API surface for "tenant requests an LB of size X" doesn't exist, and the mapping LB-flavour → amphora-flavour → Octavia LB-flavour-profile is hieradata today (`octavia-post-setup/variables.tf`), not API-driven.

### Bottom-line

The **substrate is overwhelmingly there** (Octavia control-plane is one of the more complete TF modules in `irobox`; Neutron L3-agent + router plugin are enabled and reliability-hardened in the last 4 weeks; Barbican is fully wired in SNC NUC fleet; amphora image build runs upstream). The **net-new build** sits at two layers: (a) the **CloudStore Service Package** wrapping it as `cloudstore-network-service`, and (b) the **K8s-API surface** in `opcp-infra-operator` (new CRDs + reconcilers) — neither of which exists today.

---

## Layer 1 — CloudStore Service Package (`cloudstore-network-service`)

**CB-pattern interface:** [`products/cloudstore/misc/compute-block-on-cloud-store/architecture/cloudstore-vm-bs-service-skeleton.md`](../../compute-block-on-cloud-store/architecture/cloudstore-vm-bs-service-skeleton.md) — Copier-templated repo with `cloudstore.yaml v1alpha2` + `terraform/controlplane/` + `terraform/dataplane/`, packaged as OCI artifact and pushed to Harbor.

| Finding | Status | Notes |
|---|---|---|
| `cloudstore-network-service` repo | 🔴 Missing | Brand-new repo + Copier bootstrap from `cloudstore-service-template`. ~1 day to skeleton, ~3-5 weeks to fill out (mirror of CB SOV-680 effort). |
| `cloudstore.yaml v1alpha2` shape | 🔵 Pattern exists (CB) | `control:` block declares the `cloudstore-network-service` controller targets (2 BM nodes pool); `data:` block declares per-Account FIP-quota / router-create enablement. CB workspace doc carries the exact field-level schema. |
| `target.baremetal.pools` | 🟢 Pattern + tooling reusable | CB's hypervisor-nodes pattern transfers verbatim. NS just names the pool `network-service-aggregate-hosts`. |
| OPCP Infra API credentials plumbing (`infra_api_endpoint`/`infra_api_bearer_token`) | 🟡 CB has it (SOV-674/683) | Reuse the cloudstore↔opcp-infra-operator-infra-api-keys Secret path. Adapt to NS's pool selector. |
| Per-Account App / dataplane (FIP quota + router) | 🔴 Missing | No analog in core-* services; would mirror CB's per-Account VM/Block enablement. M3-side work. |
| OCI build pipeline / Harbor mirror | 🟢 Standard | Copier template ships `.cds/workflows/` + Makefile. Same as CB. |
| Per-pool `proxy-vm/` module (Caddy + Coraza + Valkey for SNC chain) | 🔵 cs-cp / cbs-cp pattern exists | `terraform-modules-snc/paas-snc-proxy-tf/` is the template. M3 wiring. |

**Sizing hint:** **L–XL** in total. Most of the wiring is mechanical (mirror CB), but the per-Account `data:` block for FIP/Router is genuinely new.

---

## Layer 2 — Infra API surface (OPCP Infra API in `opcp-infra-operator`)

**CB-pattern interface:** `Compute` + `ComputePool` CRDs (`api/v1alpha1/`) + the REST-over-HTTPS Infra API (Mastercard restapi TF provider client). Compute Controller reconciles `Compute` CRs into Nova-joined BMs via a provisioner Job.

| Finding | Status | Notes |
|---|---|---|
| `Compute` + `ComputePool` CRDs | 🟢 Have | `charts/opcp-infra-operator/crds/opcp.ovhcloud.com_{computes,computepools}.yaml`. Network-Service hosts ride these for BM provisioning into Nova. |
| `NetworkServicePool` / `OctaviaPool` / `L3GatewayPool` CRDs | 🔴 Missing | No CRD covers an LB or L3-gateway aggregate concept today. Need new types under `opcp.ovhcloud.com/v1alpha1`. |
| `LoadBalancer` / `FloatingIP` / `Router` API surface | 🔴 Missing | These are tenant-facing primitives — the Infra API is operator-facing today. Decision needed at the workshop: do tenant-facing LBs go through Infra API at all, or do they go **directly** at Octavia API once Octavia is provisioned by Infra API? (Likely the latter — see Layer 3 note.) |
| HTTPRoute exposure | 🟢 Have | `opcp-infra-operator @ PR #18 + e50f9c0 + 155354d` — Ingress + HTTPRoute with per-rule path-prefixes + per-rule filters (ExtensionRef to Traefik middlewares). New NS-Infra-API endpoints reuse this directly. |
| Bearer-token auth surface (`opcp-internal` + `cloudstore` keys) | 🟢 Have | Pattern from `opcp-infra-operator-infra-api-keys` Secret. New NS endpoints inherit auth. |
| Swagger documentation | 🟢 Have | `opcp_infra_operator.api.swagger_enabled: true` in `fleet-infra-hieradata @ 7915c417`. New endpoints automatically documented. |

**Sizing hint:** **L** for the API surface. The CRD authoring + reconciler skeleton is mechanical (mirror Compute Controller); the harder question is the M3 scope-line between "Infra API provisions Octavia" vs "Infra API also fronts tenant LB CRUD".

---

## Layer 3 — Operator reconcilers (`opcp-infra-operator`)

**CB-pattern interface:** Compute Controller reconciles `Compute` CR → spawns provisioner Job (TF module) → BM joins Nova. Storage Controller (SOV-256) + Keystone Controller (SOV-254) are sibling reconcilers in the same binary.

| Finding | Status | Notes |
|---|---|---|
| Reconciler-base / fluxcd-integration / TF-runner infra | 🟢 Have | `internal/controller/base/`, `internal/fluxcd/`, `internal/terraform/`. New NS reconcilers compose on the same primitives. |
| Per-pool provisioner Job pattern | 🟢 Have | `cmd/provisioner/`. NS reconciler can fire the same Job machinery against new TF root-modules (octavia-deploy, l3-agent-aggregate-config). |
| Octavia-deploy reconciler logic | 🔴 Missing | No Go code under `internal/controller/` mentions octavia/amphora/lbaas. Would be a new sibling alongside Compute. |
| L3-gateway / Neutron-L3-agent aggregate reconciler | 🔴 Missing | Same — green-field on the reconciler side, even though all the deploy TF exists in irobox. |
| Heartbeat / metrics / observability hooks | 🟢 Have | New reconcilers inherit the existing patterns. |

**Sizing hint:** **M-L** per reconciler. The hard part isn't writing Go controllers (template exists); it's keeping their *contract* coherent with what the TF root-modules expect (variable handoff, secret plumbing). 2 reconcilers (Octavia + L3-Gateway) → roughly L total.

> **Team-Input + validation (2026-06-09, NSQ-026) — "Network Node ≈ Compute Node".** Marc relayed a team observation that the **Compute Operator can be reused** for NS because a network node is very similar to a compute node. **Validated against the [Compute Operator deep-dive](../../../../opcp-core/architecture/conceptions/compute-operator/summary.md) — confirmed, with a sharp scope-line:**
> - **BM-host provisioning (this project's aggregate hosts): the claim is strongest here, and it means ~zero new operator code.** An NS aggregate host *is* a Nova compute host (amphorae are VMs needing a hypervisor; the `neutron-l3-agent` runs as a DaemonSet on the k3s-federated host). The operator's `Compute` CR spec is **deliberately generic** (deep-dive §4.2 — no fixed `hostname`/`AZ` fields, everything via opaque `Vars`), so an NS host is provisioned with the **existing** `Compute`/`ComputePool` CRDs, just feeding NS aggregate `Vars` (`ovh.network`-style, `pinning_enabled: false`). This matches Layer 2's 🟢 Have classification — **no NS-specific node-provisioning reconciler needed.**
> - **Service-deploy logic (Octavia CP + L3-aggregate config): the framework reuses, the reconciler logic does not.** The reconciler-base / fluxcd / TF-runner / provisioner-Job / heartbeat scaffolding is 🟢 reusable — exactly how Storage (SOV-256) + Keystone (SOV-254) are planned as **sibling reconcilers in the same binary** (deep-dive §9.3 + §10: "same pattern, different CRD + different TF module"). But the Octavia-deploy + L3-aggregate reconcilers are still **net-new Go** (the 🔴 Missing rows above). "Reuse" = copy-of-the-pattern, not zero-effort.
> - **Not covered by operator reuse at all:** the tenant-facing FIP/Router/external-network surface (Layer 4 🔴) and the Octavia control-plane **VM** itself (a VM, not a BM the operator provisions).
>
> **Net effect on estimation:** the team's instinct independently confirms this gap analysis. For the KW24 workshop, the actionable take is **"reuse `Compute`/`ComputePool` verbatim for NS aggregate-host provisioning; size the Octavia + L3 sibling reconcilers as copy-of-Compute-Controller, not greenfield."** **✅ Decided 2026-06-09 (NSQ-026) — plan with reuse; the KW24 workshop confirms implementation detail only, it is no longer a planning gate.** See [`../decisions.md`](../decisions/index.md) 2026-06-09 entry.

---

## Layer 4 — OpenStack deployment (irobox)

The heaviest lifting is already here. Concrete file inventory.

### Octavia control-plane (🟢 Have, full stack)

```
irobox/fleet-infra/terraform/modules/openstack/octavia/      (~2 100 lines TF)
├── octavia-api-deployment.tf       (272 lines)
├── octavia-worker-deployment.tf    (226 lines)
├── octavia-health-manager-deployment.tf  (228 lines)
├── octavia-housekeeping-deployment.tf    (217 lines)
├── octavia-driver-agent-deployment.tf    (176 lines)
├── octavia-{api,health-manager}-service.tf
├── octavia-api-ingress.tf          (HTTPRoute, gateway.networking.k8s.io/v1)
├── octavia-{configmap,secret,certs-secret}.tf
├── init-job.tf · db-conn-secret.tf · mq-conn-secret.tf · bin-configmap.tf
├── variables.tf                    (518 lines — incl. amp_image_owner_id, amp_flavor_id, amp_boot_network_list, amp_secgroup_list, amp_ssh_key_name, anti-affinity, expiry_age, …)
└── etc/octavia.conf                (amphora_driver = amphora_haproxy_rest_driver; full controller-worker config)

irobox/fleet-infra/terraform/root-modules/openstack/octavia/  (~400 lines TF)
├── main.tf                          (provisions lb_mgmt network + subnet + 2 secgroups + amphora SSH keypair + RabbitMQ cluster + CNPG-DB + keystone-registration + cert-manager mTLS + module "octavia")
└── (lb_mgmt secgroups: lb-health-mgr-sec-grp + lb-mgmt-sec-grp with HM heartbeat / amphora-agent / metadata-API / ICMP / optional SSH rules)

irobox/fleet-infra/terraform/root-modules/openstack/octavia-post-setup/
└── main.tf                          (amphora.{small,medium,large} Nova flavours + openstack_lb_flavorprofile_v2 + openstack_lb_flavor_v2 — ACTIVE_STANDBY topology)
```

Status — wired in minint today: `fleet-infra-hieradata/hieradata/prod/gor-minint.yaml`:

```yaml
octavia:
  enabled: true
  enable_anti_affinity: false
  spare_amphora_pool_size: 4
  amp_ssh_enabled: true
```

### Amphora image (🟢 Have, externally built)

```yaml
# fleet-infra-hieradata/hieradata/{prod/gor-minint,dev/common}.yaml
amphora-x64-haproxy:
  source_url: https://rt.ovhcloud.tools/artifactory/gor-publiccloud-cds-release/
              stash_ovh_net/gor/octavia/GOR/octavia/2025.2.0-35-3.sha.ge05099a/
              amphora-x64-haproxy-trixie-2025.2.0-35-3.sha.ge05099a.qcow2
  container_format: bare · disk_format: qcow2 · visibility: private
  tags: [amphora]
```

No NS-side build pipeline to construct.

### Barbican (🟢 Have, fully deployed in SNC fleet)

```
irobox/fleet-infra/terraform/modules/openstack/barbican/   (full stack)
├── api-deployment.tf · keystonelistener-deployment.tf · worker-deployment.tf
├── api-{ingress,service,servicemonitor,exporter-service,kmip-secret,vault-ca-secret}.tf
├── db-conn-secret.tf · db-slave-conn-secret.tf · memcached-conn-secret.tf · mq-conn-secret.tf
├── init-job.tf · prometheus-rule.tf · monitoring/
└── variables.tf · outputs.tf

# Already deployed in SNC NUCs (per fleet-infra-snc-hieradata/flow-matrix/snc-prod-sbg-nuc0.md):
# barbican-api ↔ kube-apiserver / ingress-nginx / barbican-db (CNPG) / KMIP API
```

Octavia just needs `service_catalog['key-manager']` registration — already wired via `module.service_registration` in the Octavia root-module pattern.

### Neutron L3-agent + router plugin (🟢 Have)

```
irobox/fleet-infra/terraform/modules/openstack/neutron/
├── l3-agent-{daemonset,configmap,secret}.tf
├── ovs-{agent-,}daemonset.tf · ovs-agent-{configmap,secret}.tf
├── server-{configmap,secret}.tf · bgp-dragent-* · metadata-agent-* · dhcp-agent-*
└── etc/neutron-{server,l3-agent,ovs-agent,dhcp-agent,metadata-agent,bgp-dragent}.conf

# service_plugins enabled (neutron-server.conf):
#   neutron_dynamic_routing.services.bgp.bgp_plugin.BgpPlugin, router, trunk

# Recent reliability hardening (in flight):
#   PR #684 (SOV-784)  ovs-agent init container (AMQP polling 900s)
#   PR #703 (SOV-918)  api-readiness.py checks fanout queue subscription
#   PR #705            VLAN-range hieradata override hook
```

### External network / Router / FIP TF (🟡 Have-but-adapt — revised 2026-06-09, NSQ-027)

No `openstack_networking_floatingip_v2`, no `openstack_networking_router_v2`, no `openstack_networking_network_v2` of `router_external = true` type anywhere in `irobox/fleet-infra/`. The `lb_mgmt` network in octavia root-module is a mgmt VLAN, **not** a tenant external network.

> **Revised 2026-06-09 (Marc-input + code re-check, NSQ-027).** The "🔴 Missing" reads too strongly — the absence is **by design**, not a gap. **Today's SNC model delivers customer IP ranges by *routing*, not by NAT/floating-IP:**
> - **VLAN-backed provider networks** — the `nuc_networks` blocks in `fleet-infra-snc-hieradata/hieradata/prod/snc-*-nuc*.yaml` define `network_type: vlan` provider nets on `physical_network: physnet1` with a `subnet` + `segmentation_id` + `gateway_ip` (e.g. snc-rbx-nuc1 `oob: subnet 10.203.28.0/29, vlan 300`). A range is mapped onto a VLAN segment the customer's network uses **directly** — "route IP ranges into a private network of a customer, and he can then use the IPs" (Marc 2026-06-09).
> - **BGP dynamic routing** — `neutron-bgp-dragent` DaemonSet (`irobox/.../neutron/bgp-dragent-daemonset.tf`) + `BgpPlugin` service-plugin advertise routable prefixes to the fabric. **Enabled in minint** (`gor-minint.yaml`: `neutron_bgp_agent_enabled: true`, `neutron_bgp_router_id: 192.168.102.5`, `neutron_bgp_agent_net_prefix: 192.168.102.0/24`); toggleable per-env (default `false` in `neutron_vars.yaml`).
>
> So no `floatingip` / `router_external` TF exists because **SNC doesn't use the NAT model** — ranges are routing/L2-provider-delivered. **What NS adds:** with Neutron **L3 routers active** (the `router` service-plugin NS brings), the standard SNAT + Floating-IP-NAT path becomes available *on top* of this — "with L3 routers active, they can of course be used to do that" (Marc).
> - **Sizing impact:** the provider-VLAN + BGP substrate for delivering ranges **already exists** → this is **🟡 adapt** (wire the L3-router/FIP-NAT layer onto the existing pattern), **not 🔴 build-from-scratch**. The original "L" FIP/Router sizing shrinks accordingly.
> - **Still open (NSQ-027, pending Damien):** authoritative confirmation of how SNC **prod** delivers customer *public/routable* ranges (provider-VLAN vs BGP vs fabric-static), and whether NS should expose tenant FIP-CRUD via Neutron-native API or a thin NS surface. Damien-confirm closes it.

Residual gap (smaller than first assessed): the tenant-facing **FIP / Router CRUD path** wired into the NS-API surface — layered on the existing provider-net + BGP substrate, not a greenfield "provider-network bootstrap".

> **Status update — 2026-06-09 (Charly Gregoire, source Vincent).** Verbatim from chat:
> - *"it won't be a hacky way ^^ it will be the target of automation we want to do"*
> - *"I am currently writing the design for the middleware/IS system to build"*
> - *"basically its a middleware that interacts between the 2IIP team system, agora, the business logic, the edge API, openstack."*
> - *"we will also introduce the orchestration in this system to manage the workflows we want to execute"*
>
> **Interpretation.** The "route IPs into the customer network" public-connectivity mechanism is the *intended* model, not a stopgap — it's being **productised as an automation/orchestration middleware** that Charly Gregoire is designing now. That middleware sits above OpenStack and brokers between OVH internal systems (`2IIP`, `agora`), the business logic, and the edge API.
>
> **Impact on NS.** This is a **net-new integration point / dependency** for the NS public-connectivity path (M3/M4): NS's L3-router + FIP work likely **plugs into Charly's middleware** rather than owning the public-IP lifecycle end-to-end. The boundary — does NS own FIP/Router CRUD (Neutron-native) or call into the middleware — is **NSQ-028** and gates how much of the Layer-3/Layer-4 surface is NS-scope vs middleware-scope. Read Charly's design-doc when it lands before sizing M3/M4 public-connectivity.
> - **Owner add:** Charly Gregoire — public-connectivity automation / middleware-IS design. Vincent = original source.

### Octavia API exposure pattern (🟢 Have, HTTPRoute)

```hcl
# octavia/octavia-api-ingress.tf — despite the name, it's an HTTPRoute:
apiVersion = "gateway.networking.k8s.io/v1"
kind       = "HTTPRoute"
spec.parentRefs[0] = { name = each.value.gateway, namespace = "traefik", sectionName = var.name }
```

Matches the cs-cp / cbs-cp exposure pattern (NSQ-005 decision: Octavia API rides CB's proxy chain).

### Nova aggregate provisioning (🟢 Have, hieradata-driven)

```hcl
# irobox/fleet-infra/terraform/root-modules/compute-vm-hosts-trunk/aggregates.tf
resource "openstack_compute_aggregate_v2" "aggregates" {
  for_each = var.os_aggregates  # → reads hieradata
  ...
}

# fleet-infra-hieradata/hieradata/prod/gor-minint.yaml
os_aggregates:
  ovh.b3-milan:        { zone: nova-vm-shared, hosts: [paas-snc-srv1, …, srv5] }   # tenant-VM aggregate
  cust2.b3-milan:      { zone: dedicated, metadata: {filter_tenant_id_1: …}, hosts: [srv6] }
  ovh.network:         { zone: nova-vm-shared, flags: {pinning_enabled: "false"}, hosts: [srv3] }
                       #                                  ↑↑↑ already wired — exact prototype for L3-services aggregate
```

The `ovh.network` aggregate is the exact prototype for provisioning the **NS aggregate hosts** via Compute-Operator reuse. *(NSQ-006 re-corrected 2026-06-10: per current irobox master the **amphora aggregate runs CPU-pinning OFF** — the amphora flavors now actually land on `ovh.network` (`pinning_enabled: false`, `compute-vm-hosts-trunk_vars.yaml:153-159` — `zone: nova-vm`, `metadata: { ovh.network: "true" }`, `flags: { pinning_enabled: false, qcow2_enabled: true }`) and dropped `hw:cpu_policy=dedicated`. The `Vars` example above (gor-minint snapshot 2026-06-08) is consistent with that end-state; the 2026-06-09 "pinning ON" annotation is superseded.)*

---

## Layer 5 — Config / Hieradata (`fleet-infra-hieradata` + `fleet-infra-snc-hieradata`)

| Finding | Status | Notes |
|---|---|---|
| `octavia.enabled: true` (dev + minint) | 🟢 Have | `hieradata/dev/{common,gor-drannou,gor-goku}.yaml` + `prod/gor-minint.yaml`. |
| Octavia `enable_anti_affinity` + `spare_amphora_pool_size` + `amp_ssh_enabled` | 🟢 Have | All knobs present in minint hieradata. |
| Amphora image source-URL pinned | 🟢 Have | Versioned at `2025.2.0-32-1.sha.gb77982d` (dev) / `2025.2.0-35-3.sha.ge05099a` (minint). |
| Octavia in any SNC NUC hieradata | 🔴 Missing | `grep -l octavia fleet-infra-snc-hieradata/hieradata/prod/*.yaml` → 0 results. Octavia not enabled in SNC NUC fleet today. |
| Barbican in SNC NUC fleet | 🟢 Have | flow-matrix tables confirm full graph (API · DB · KMIP). |
| `cust2.b3-milan` aggregate (dedicated, filter_tenant_id) | 🟢 Pattern | Templates the NS-tenant-isolation aggregate pattern if/when we want per-tenant amphora aggregates. |
| Apiproxy MKS pattern (PR #700/#709 from code-survey) | 🟢 Pattern reusable | If Octavia API needs a per-env apiproxy entry (probably yes for SNC), the pattern is already wired for MKS in `gor-minint.yaml apiproxy.config.mks_*`. |
| VLAN range carve-out for NS-amphora-aggregate | 🔴 Missing | `fleet-infra-snc-hieradata @ PR #98` carves OOB VLANs out of customer-pod VLAN ranges using the new `neutron_ml2_network_vlan_ranges` override (irobox PR #705). NS-specific VLAN range (LB tenant-data plane) is not yet defined. New `octavia_data` VLAN role in Netbox + carve-out to land per-env. |

**Sizing hint:** **S–M** for hieradata work per environment. M2 = enable Octavia in 1 SNC NUC env. M3 = full SNC NUC fleet rollout + per-env VLAN range definitions.

---

## Layer 6 — Terraform / Provisioning (`terraform-modules-snc`)

| Finding | Status | Notes |
|---|---|---|
| `paas-snc-proxy-tf/proxy-group-{global,regional}-l3-cp-proxy.tf` + `proxy-group-l3-dp-proxy.tf` | 🟢 Have | Caddy proxy VMs already provisioned (cs-cp / cbs-cp pattern). NSQ-005 decision: Octavia API rides this proxy chain in M3. |
| `outputs.tf` exposes `{global,regional}_l3_cp_proxy_frontend_floating_ips` + `l3_dp_proxy_frontend_floating_ips` | 🟢 Have | Downstream NS-cloudstore-package TF can consume these to pin DNS / FW egress rules against the proxy FIPs. |
| L2/L3-specific `extra_*_backend_fw_egress_rules` split | 🟢 Have | `extra_global_l3_backend_fw_egress_rules` + `extra_regional_l3_backend_fw_egress_rules` (4 files, ~50 lines moved per PR #68cd676). NS will use these to permit traffic from proxy → Octavia API. |
| oauth2-proxy chain (admin URL termination) | 🟢 Pattern reusable | `terraform-modules-snc @ 4987562/2de2474` — regional L2 oauth2-proxy. Octavia IT-Admin UI flow likely rides the same path. |
| Octavia-specific module in `terraform-modules-snc` | 🔴 Missing | No `paas-snc-octavia-tf/` analog. If we want per-deployment Octavia config injection at the SNC layer, this would be net-new. |
| openstack_instance_v2 / openstack_keypair / openstack_network | 🟢 Have | Generic OpenStack TF modules that the NS-Service can reuse via composition. |

**Sizing hint:** **S** for reuse of existing proxy infra; **M** if we add a `paas-snc-octavia-tf/` module for per-deployment SNC overlays.

---

## Per-step user-flow gap walk

| Step | What's there | What's missing | Sizing hint |
|---|---|---|---|
| **1.** IT-Admin enables `cloudstore-network-service` | CloudStore catalogue scan + Kustomization machinery (proven by CB) | The `cloudstore-network-service` repo + cloudstore.yaml + the OCI artifact. CloudStore docs+how-to + CB's skeleton doc as templates. | L–XL (mirror CB SOV-680) |
| **2.** IT-Admin picks ≥2 BM hosts | `target.baremetal.pools` schema + CloudStore UI for pool selection (proven by CB) | NS-specific pool naming + the contract that "both aggregates share these 2 BM" | S |
| **3.** Infra API gets new endpoints (LB-pool, L3-gateway-pool, FIP-allocation) | HTTPRoute exposure + bearer-token auth + Swagger (proven, PR #18) | The endpoints themselves + matching CRDs (`NetworkServicePool` or `OctaviaPool`+`L3GatewayPool`+optional `FloatingIPPool`) | L |
| **4.** New reconciler(s) in `opcp-infra-operator` | Compute Controller pattern + reconciler-base + provisioner-Job machinery | Network-Service reconciler(s): provision Octavia control-plane (call irobox root-module), set up Nova aggregates with NS-flavour-extra-specs, configure L3-agent aggregate. | M–L |
| **5a.** Octavia control-plane deploys | Full TF module (API + Worker + HM + HK + DA + Mq + DB + certs + HTTPRoute) | Reconciler trigger to fire the TF + variable handoff (`amp_image_owner_id`, `amp_flavor_id`, `amp_boot_network_list`, …) computed from CRD inputs | M |
| **5b.** Amphora-aggregate Nova flavour created | TF in `octavia-post-setup` (S/M/L flavours) + aggregate machinery — **per current code (2026-06-10) flavors already target `ovh.network` (`pinning_enabled: false`) + multiqueue, no `hw:cpu_policy=dedicated`** | Reconciler trigger (extra_specs = `aggregate_instance_extra_specs:ovh.network` + `hw:vif_multiqueue_enabled`, CPU-pinning **OFF** per NSQ-006 re-correction 2026-06-10; over-commit ratios default = 1.0) | S |
| **5c.** L3-services aggregate config | Nova aggregate TF (`ovh.network` prototype already in hieradata) | Same reconciler trigger + L3-agent-specific Daemonset placement (node-affinity to aggregate hosts) | S–M |
| **5d.** Amphora image already in Glance | External pipeline already runs + hieradata + glance_image TF | Wire NS pool to use it (no build) | S |
| **5e.** Barbican wiring to Octavia | Barbican deployed + service-catalog registration (`key-manager`) + KMIP backend | Octavia's `[certificates]` section pointing at Barbican endpoint — minor config | S |
| **5f.** Neutron L3 router + external network + FIP pool TF | L3-agent + router plugin enabled + secgroups | **Net-new TF root-module** for provider-network bootstrap (external net + subnet + FIP allocation pool + tenant router defaults) | M |
| **6.** Tenant creates LB / Gateway / FIP via Octavia API + Neutron API | Octavia API directly exposed via HTTPRoute in M2; same for Neutron API (already accessible to keystone-auth'd tenants) | M3: route through SNC-proxy chain (analog to CB's SOV-715/731 work). | M (analog to CB) |
| **7.** Customer UI exposes LB / Gateway create + FIP-allocate | CB's LZM (`Landing Zone Manager`) is the home — Model A per NSQ-009 | LZM forms for LB/Gateway create + FIP-in-VM-create-form (lives in CB M3) | M (CB-side, not NS) |
| **SNC qualification (M3)** | Octavia working in dev/minint; Barbican qualified in SNC fleet | Threat-model + ANSSI-validation + pen-test-window + hardening backlog for Octavia + L3 in SNC NUC fleet — **first-time qualification, not parity** (NSQ-025) | XL · multi-month |

---

## Cross-references

### Existing Jira tickets already touching this space

| Ticket | What it covers |
|---|---|
| SOV-668 | Cilium LoadBalancerClass explicit on all control-plane LBs (incl. Octavia Health-Manager Service). Closed by code-survey theme 4. |
| SOV-784 | Neutron OVS-agent init container (AMQP polling). Reliability hardening directly affecting L3-services-aggregate stability. |
| SOV-918 | Neutron API readiness fanout-queue check. Same reliability theme. |
| SOV-218 | opcp-infra-api HTTPRoute exposure pattern. NS-API endpoints reuse this. |
| SOV-731 | M2 endpoint exposure via SNC proxies (cs-cp / cbs-cp). NSQ-005 decision: Octavia API rides this. |
| SOV-715 | cbs-cp / cs-cp proxies in SNC stack. M3 housekeeping work that NS rides downstream. |
| SOV-823 | opcp-infra-status-agent (separate, but second consumer of the HTTPRoute exposure). |
| LVL2-22123 | Network-Services outer Epic — parent for NS planning. |
| SOV-256 | Storage Controller in opcp-infra-operator — pattern reference for the NS reconciler. |
| SOV-254 | KeystoneDomain Controller — analog Network-Service per-Account reconciler. |

### Relevant NSQs

| Q | Relevance |
|---|---|
| ~~NSQ-001 Barbican~~ | ✅ Closed — Barbican available. Confirmed in irobox + SNC flow-matrix. |
| **NSQ-002 Sizing taxonomy** | Open. Critical for the API layer (Layer 2) — drives how we expose LB-flavour through Infra API + LZM. |
| ~~NSQ-003 OVS vs OVN~~ | ✅ Closed — Stay with OVS. Confirmed in code-survey + neutron-server.conf. |
| ~~NSQ-005 Octavia API exposure~~ | ✅ Closed — CB proxy chain. Confirmed by HTTPRoute already in place in octavia/octavia-api-ingress.tf. |
| ~~NSQ-006 Over-commit~~ | ✅ Closed — `ovh.network` aggregate w/ `pinning_enabled: false` is the prototype already in hieradata. *(Re-corrected 2026-06-10: per current irobox master the amphora flavors now actually land on `ovh.network` with pinning OFF — the `Vars` prototype IS the pinning policy after all; the 2026-06-09 "dedicated" annotation is superseded.)* |
| **NSQ-007 Amphora image lineage** | Open. Image build is at `rt.ovhcloud.tools/artifactory/gor-publiccloud-cds-release/...` — pre-built upstream. Lineage Q is: who owns the build pipeline + how does SNC qualify it? |
| **NSQ-009** | ✅ Closed — FIP-in-VM-form is CB M3 LZM work. |
| **NSQ-010 VLAN-role for LB-tenant-data plane** | Open. `octavia_mgmt` exists in Netbox; equivalent for tenant data plane = new. |
| **NSQ-013** | ✅ Closed — single combined service. |
| ~~NSQ-014 Octavia CP HA topology~~ | Open but not gating. |
| **NSQ-025 First SNC qualification path** | Open. M3 sub-workstream — multi-month. |

### CB sibling tickets where SOV-* numbers cover overlapping ground

- **SOV-680** (CB Service Package) — NS will create its analog `cloudstore-network-service` repo following the same shape.
- **SOV-674 / SOV-683** (CB Infra API credentials plumbing) — NS reuses verbatim.
- **SOV-684** (CB compute provisioning via Infra API) — NS analog provisions amphora-aggregate + L3-aggregate via Infra API.
- **SOV-731** (CB M2 endpoint-exposure alignment) — NS-decision (NSQ-005) explicitly asks SOV-731 to absorb Octavia API as a new M2 endpoint.

---

## Methodology notes

**Sampled vs. read in depth:**
- **Read in depth:** Octavia TF module + root-module (2 500+ lines); Neutron TF (modules + root + etc/), Barbican TF module + flow-matrix; `opcp-infra-operator` api / controller / chart structure; minint + dev hieradata octavia config; terraform-modules-snc paas-snc-proxy-tf.
- **Sampled (greps + spot reads):** cloudstore-* family (only verified absence of Octavia refs in cloudstore-bl / cloudstore-api); SNC NUC hieradata (greps confirmed no `octavia:` block); the 8 cloudstore-service-core-* repos (one read = `cloudstore-service-core-keycloak/cloudstore.yaml` — confirms the v1alpha2 schema baseline).
- **Skipped:** detailed inspection of `irobox/ansible/`; deep reading of `opcp-infra-operator/specs/*` (just spec-driven design docs); `release-notes/`; bgp-dragent / dhcp-agent / metadata-agent configs (peripheral to LB/L3 scope).

**Uncertainty flags:**
- **VRRP / keepalived setup for amphora active-standby** — the Octavia TF deploys `enable_anti_affinity` flag + sets `loadbalancer_topology=ACTIVE_STANDBY` in the LB-flavour-profile, but the VRRP keepalived config inside the amphora image is opaque from outside the image build. Assume "works" because Octavia ACTIVE_STANDBY topology is upstream-standard, but if the workshop wants confidence we should read the amphora image build repo separately.
- **No tenant external-network TF found** — I searched `irobox/fleet-infra/` exhaustively for `router_external` / `floatingip` / `openstack_networking_router_v2` and found nothing. **Resolved 2026-06-09 (NSQ-027):** the absence is by-design — SNC delivers customer ranges by routing (VLAN provider nets + BGP `neutron-bgp-dragent`), not NAT, so there's no floating-IP TF to find. Finding downgraded 🔴 → 🟡. See the [External network / Router / FIP section](#external-network--router--fip-tf--have-but-adapt--revised-2026-06-09-nsq-027) above. Damien-confirm of the SNC-prod public-range delivery still pending.
- **`octavia-post-setup` extra_specs hard-code `aggregate_instance_extra_specs:ovh.b3-milan = "true"`** — this meant today's amphora flavour pointed at the *tenant-VM aggregate*. **✅ FIXED upstream (verified 2026-06-10):** current irobox master (`octavia_post_setup_vars.yaml`) has the flavors targeting **`ovh.network`** (`pinning_enabled: false`) with `hw:cpu_policy=dedicated`/`hw:cpu_thread_policy` dropped — the aggregate-separation adapt-work flagged here is **largely done in code**. Remaining: Damien-confirm the migration was deliberate remediation (NSQ-006 re-correction 2026-06-10).
- **SNC NUC hieradata sampled** — I confirmed absence of `octavia:` block, but didn't enumerate every NUC's full hieradata layout. Confidence high (`grep -l` came back empty across all `snc-{rbx,sbg,gra}-nuc*.yaml`), but a single NUC-specific override file could falsify this.

**Time spent:** ~45 min repo grep + ~30 min reading TF modules in depth + ~15 min cross-referencing with workspace docs.

---

## Open questions raised by this gap analysis (candidates for new NSQs)

1. **Where is the tenant external network provisioned today?** Possibly outside `fleet-infra/`. Gates the "🔴 Missing FIP/router TF" sizing. → Damien / Pierre-Yves. **→ Formalized as NSQ-027; Marc asked Damien 2026-06-09.**
2. **`octavia-post-setup` flavour extra-specs hard-code the tenant-VM aggregate as the amphora landing zone** — **✅ FIXED upstream (verified 2026-06-10):** current irobox master moved the flavors to `ovh.network` (`pinning_enabled: false`) and dropped the `dedicated`/`require` pinning specs — both the aggregate-separation refactor and the pinning alignment flagged here are done in code (NSQ-006 re-correction 2026-06-10). Residual: Damien-confirm the migration was deliberate. → Octavia owner / NS Estimation.
3. **Who owns the amphora image build pipeline upstream** at `rt.ovhcloud.tools/artifactory/gor-publiccloud-cds-release/.../octavia/`? Relevant for NSQ-007 (image lineage) + SNC-qualification (M3). → Probably OPCP Core image lifecycle (Mateusz Klejn).
4. **Does the `apiproxy` pattern (PR #700/#709) need a per-env entry for Octavia API** if we run on a SNC NUC where it doesn't yet exist? → Workshop sub-Q.
5. **`octavia_data` Netbox VLAN role for the LB-tenant-data plane** — `octavia_mgmt` exists for the mgmt plane; equivalent for data plane = open (NSQ-010). → Theme 1 of the code-survey + this analysis.

---

*End of analysis. Last updated 2026-06-08.*

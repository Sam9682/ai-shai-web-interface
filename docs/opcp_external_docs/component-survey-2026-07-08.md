# NS Component Survey — 2026-07-08

> **What this is:** Survey of 9 external repos for Network Service (NS) components — what already exists, what needs building, and the 4 biggest surprises. Conducted 2026-07-08 via parallel agent reads across irobox / octavia / neutron / opcp-infra-operator / cloudstore fleet.
>
> **Companion docs:** [Code survey 2026-06-08](code-survey-2026-06-08.md) (earlier 5-repo survey) · [Code have-vs-missing 2026-06-08](code-have-vs-missing-2026-06-08.md) (gap analysis) · [L3 & LB Primer](l3-and-lb-primer.md) · [Open questions](../open-questions.md).

---

## Repos surveyed

| Repo | Path (local) |
|---|---|
| `irobox` | `/Users/twiebe/git/opcp/irobox` |
| `octavia` GOR fork (branch `2025.2`) | `/Users/twiebe/git/opcp/octavia` |
| `neutron` GOR fork (branch `2025.2`) | `/Users/twiebe/git/opcp/neutron` |
| `opcp-infra-operator` | `/Users/twiebe/git/opcp/opcp-infra-operator` |
| `cloudstore-fleet-infra` | `/Users/twiebe/git/opcp/cloudstore-fleet-infra` |
| `cloudstore-bl` | `/Users/twiebe/git/opcp/cloudstore-bl` |
| `cloudstore-bl-agora-catalog` | `/Users/twiebe/git/opcp/cloudstore-bl-agora-catalog` |
| `cloudstore-api` | `/Users/twiebe/git/opcp/cloudstore-api` |
| `cloudstore-service-compute-and-block` (CB — NS template) | `/Users/twiebe/git/opcp/cloudstore-service-compute-and-block` |
| `terraform-modules` / `paas-snc-proxy-tf` (SNC) | `/Users/twiebe/git/snc/terraform-modules` |

---

## What already exists (no build needed for NS M1)

### irobox — Octavia config is more complete than expected

| Component | File | Key values |
|---|---|---|
| Octavia enable flag | `hieradata/fleet-infra/octavia_vars.yaml` | `octavia.enabled`, anti-affinity, no SSH to amphorae |
| Amphora flavors S/M/L | `hieradata/fleet-infra/octavia_post_setup_vars.yaml` | 1/2/4 vCPU; `aggregate_instance_extra_specs:ovh.network: "true"` + `hw:vif_multiqueue_enabled: "true"` on all three |
| lb-mgmt network | `octavia_vars.yaml` | VLAN 410, prefix `198.18.114.0/23` (`netbox_prefix_lb_mgmt`) |
| octavia_mgmt VLAN role | `hieradata/netbox/prefix_vlan_roles.yaml:45` | slug: `octavia_mgmt` |
| Octavia TF module | `fleet-infra/terraform/modules/openstack/octavia/etc/octavia.conf` | `amphora_driver=amphora_haproxy_rest_driver`, `compute_driver=compute_nova_driver`, Barbican cert manager wired |
| Octavia ingress FQDN | `hieradata/fleet-infra/ingress_vars.yaml:46,185` | `octavia.{default_base_dns_name}` already defined |
| ovh.network aggregate | `hieradata/fleet-infra/compute/compute-vm-hosts-trunk_vars.yaml:153` | `pinning_enabled: false`, `qcow2_enabled: true`; hosts list empty (TF-populated at deploy) |
| Neutron L3 agent | `hieradata/fleet-infra/neutron_vars.yaml:94` | Image versions defined |
| BGP DRAgent | `neutron_vars.yaml:91,139` | `neutron_bgp_agent_enabled: false` (optional, infrastructure exists) |
| L3-agent nodes | `fleet-infra/terraform/root-modules/openstack/neutron/main.tf:38` | K8s label `openstack/network-node: enabled` identifies them |

**Key clarification on L3 aggregate:** There is **no dedicated L3-services aggregate** in the current config. The Neutron L3 agent runs as a DaemonSet on controller nodes labeled `openstack/network-node: enabled`. A dedicated physical L3-services aggregate is a larger-deployment concern, not Day-1.

### octavia GOR fork — amphora hardening complete

Branch `2025.2`, 14 downstream PRs vs upstream:

| PR | Description |
|---|---|
| #14 | AppArmor: allow CAP_KILL for haproxy master-worker signalling |
| #12 | CIS separate-filesystem layout (LVM: lv_root/lv_var/lv_var_log/lv_var_log_audit/lv_var_tmp/lv_home/lv_tmp) |
| #13 | Harden `/dev/shm` as tmpfs (nodev/nosuid/noexec) |
| #11 | Confine HAProxy with AppArmor enforce-mode profile |
| #9 | `stats_prometheus` statistics driver |
| #8 | PostgreSQL compat: pool.lb_algorithm column resize (backport) |
| #7 | pool.lb_algorithm + listener.tls_certificate_id column size fixes |
| #2, #10 | CI/CD pipeline (docker / amphora qcow2 builds) |

Full DIB element set: `amphora-apparmor`, `amphora-cis-partitions`, `amphora-fips`, `amphora-selinux`, `certs-ramfs`, `cpu-pinning`, `haproxy-octavia`, `keepalived-octavia`, and more. **No NS-specific API patches** — all hardening + infra.

### neutron GOR fork — L3 patches present

Branch `2025.2`:
- ML2 driver bump; `service-compute` role enabling nova-compute cross-tenant port reads
- OVN L3 post-fork init + conntrack helpers RBAC fixes
- `libunbound` + `python3-unbound` for OVS/OVN DNS resolution
- No NS-specific patches

### opcp-infra-operator — clear pattern, zero NS code

3 active service bundles: **Compute**, **Storage** (soft-gated), **KeystoneDomainFederation**. Zero NS code. The **soft-gate pattern** (CRDs always install; reconciler registers conditionally) is the exact template for NS:

```
NetworkPool controller  ←  mirrors  →  StoragePool controller
Network controller      ←  mirrors  →  Storage controller
```

Interfaces NS must implement: `ProvisionedResource` + `ResourcePool` (from `internal/controller/base/types.go`).

### cloudstore-api — already generic

Service discovery reads OCI images from Harbor project `services`. NS auto-registers once `cloudstore-service-network` image is published. **No changes needed in cloudstore-api.**

### CB service package — direct NS template

`cloudstore-service-compute-and-block` is the NS implementation template:

| Layer | What CB did | NS does same |
|---|---|---|
| **M1** | `cloudstore.yaml` v1alpha2 + TF `restapi` provider → `opcp-infra-api` pool + node resources | `cloudstore-service-network` with NetworkPool/Network resources |
| **M2** | Go reconciler on branch `feat/m2-controlplane-sketch` (reconcile loop / API client / status server / phase A–E roadmap) | Copy-of-CB reconciler, adapted for Network resources |
| **Air-gap** | `cmd/tf-updater` binary rewrites remote module/Helm sources to local paths | Must include — same binary pattern |

**Hard TF constraint:** root `variable { type = ... }` only accepts `string`, `number`, `bool` — no `list()`, `map()`, `object()`. CloudStore parses these statically.

---

## What needs building

| Component | Target | Priority | Notes |
|---|---|---|---|
| `cloudstore-service-network` repo | New repo (doesn't exist) | M1 blocker | `cloudstore.yaml` + TF controlplane (`restapi` → `opcp-infra-api`) + TF dataplane. Model on CB. |
| NetworkPool + Network CRDs + reconciler | `opcp-infra-operator` | M1 blocker | Zero NS code today. Add soft-gated pair identical to StoragePool/Storage. |
| fleet-infra GitOps entry | `cloudstore-fleet-infra/apps/` | M1 | Terraform CR + OCIRepository for `cloudstore-service-network` — same pattern as CB entry. |
| **Octavia proxy entry** | `snc/terraform-modules/paas-snc-proxy-tf` | **M3 blocker** | Neutron IS fronted (regional L2+L3 Caddy groups); **Octavia is absent**. Tenant-facing LBaaS needs a new Caddy proxy group frontend+backend. See NSQ-010. |
| `octavia_translator` + `neutron_translator` | `cloudstore-bl/layer_2/services/` | M2/M3 | BL event handlers for usage metering. Only `nova_translator` + `producer` exist today. |
| Agora catalog entries | `cloudstore-bl-agora-catalog/catalog_data/sovereign/product/` | M2/M3 | LB product (with S/M/L pricing) + Router product JSON. Neither exists. |

---

## 4 Biggest surprises

**1. Octavia config in irobox is more complete than expected.**
Flavors, VLAN role, aggregate, Barbican wiring, ingress FQDN — all defined. The infra layer (Day-1 manual install) is essentially ready. What's missing is the operator + service package layer on top.

**2. Octavia NOT in the SNC proxy.**
Neutron is fully fronted (`regional_l2_neutron`, `regional_l3_neutron` Caddy groups in `paas-snc-proxy-tf`). Octavia has zero entries anywhere in the proxy service map. M3 SNC qualification requires a new proxy group for the Octavia API (tenant-facing LBaaS endpoint). This is a concrete gap to wire into the NSQ-025 SNC qualification scope. See also NSQ-010 refinement 2026-07-08.

**3. No NS operator code — but the copy-of-Storage pattern is right there.**
Zero scaffolding in `opcp-infra-operator`. But Storage (added after Compute) is the exact template: soft-gated NetworkPool + Network CRD pair, same interfaces, same provisioner pattern. Not greenfield — pattern extraction.

**4. CB M2 Go reconciler is a complete template.**
On branch `feat/m2-controlplane-sketch`: full reconciler loop, API client (with RFC 7807 error parsing), status server (`/healthz`, `/readyz/safe-to-delete`, `/status`, `/metrics`), and a phase A–E roadmap with concrete TODO stubs. NS M2 copies this wholesale.

---

## See also

- [NSQ-010](../open-questions.md) — SNC proxy interaction with LB data plane (Octavia-absent-from-proxy finding 2026-07-08)
- [NSQ-025](../open-questions.md) — SNC qualification track (M3); Octavia proxy gap feeds the punch-list
- [NSQ-027/028](../open-questions.md) — public connectivity middleware (Charly Gregoire); FIP/router lifecycle boundary
- [Code have-vs-missing 2026-06-08](code-have-vs-missing-2026-06-08.md) — earlier gap analysis (5 repos, pre-operator survey)
- [L3 & LB Primer](l3-and-lb-primer.md) — OVS vs OVN levels, why L3 is Beta scope
- [OVN/OVSDB architecture](ovn-ovsdb-architecture.md) — how ovn-controller connects to the SB-DB directly via OVSDB monitor

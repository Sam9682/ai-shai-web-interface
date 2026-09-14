# Code Survey — Network Service relevance (2026-06-08)

> Period: 2026-05-11 → 2026-06-08 (since the last full survey on the Compute & Block side).
> Repos surveyed: **irobox** · **terraform-modules-snc** · **opcp-infra-operator** · **fleet-infra-hieradata** · **fleet-infra-snc-hieradata**.
> Total unpulled commits scanned: **131** (irobox 42 · tf-modules-snc 42 · opcp-infra-operator 19 · fleet-infra-hieradata 17 · fleet-infra-snc-hieradata 11).
> LB / Gateway-relevant PRs surveyed in depth: **17**.
> Purpose: feed the freshly distilled [Network Service product brief](../source-material/product-brief-2026-06-08.md) and the upcoming kick-off for Octavia LBaaS + Neutron L3 Gateway planning.

---

## Quick read

- **Octavia is alive in the deploy graph**, but only as plumbing today: a Netbox VLAN role (`octavia_mgmt`) was added, the Health-Manager K8s Service now pins `loadBalancerClass: io.cilium/l2-announcer`, and an amphora-flavour UUID resolver landed earlier. **No tenant-facing LBaaS API work yet** — the team is finishing the substrate Octavia needs.
- **Neutron just got two reliability hardenings** (PR #684 ovs-agent init container, PR #703 API readiness fanout-queue check, both linked to SOV-784 / SOV-918) and a clean refactor of how VLAN ranges are declared per-pod (PR #705 + the matching `fleet-infra-snc-hieradata` PR #98 that reserves OOB VLAN slots per NUC). These directly affect L3 router stability and customer-pod VLAN allocation — both load-bearing for L3 Gateway.
- **Gateway API / HTTPRoute is now the canonical API-exposure mechanism for `opcp-infra-api`** ([opcp-infra-operator#18 / e50f9c0 / 155354d](SOV-218)). The chart supports per-rule path-prefixes + per-rule filters (e.g. Traefik middlewares via `ExtensionRef`). Same direction was applied to the bootstrap flow and the backup `seed.sh` (irobox PRs #658, #664) — Ingress is being phased out across the board.
- **The Cilium `LoadBalancerClass` story is now explicit** (irobox [PR #646 / SOV-668](SOV-668)) — every in-cluster `Service type=LoadBalancer` (Octavia HM, Traefik, Neutron, Nova, Netbox, KMS, log-forwarder, ragnarok, …) gets `spec.loadBalancerClass: io.cilium/l2-announcer`. This is the **K8s LB primitive used by control-plane components**; tenant-facing LBs go through Octavia/amphorae, not this.
- **Floating-IP outputs + L2/L3-specific proxy egress rules** landed in `terraform-modules-snc` (`paas-snc-proxy-tf/`). FIP addresses are now consumable downstream (`global_l3_cp_proxy_frontend_floating_ips`, etc.), and the previous single `extra_*_backend_fw_egress_rules` variable was split into L2- and L3-specific copies. The Network Service will sit downstream of the same FIP / proxy machinery.

## Themes

### Theme 1 — Octavia substrate maturing (Netbox · LB class · amphora flavour)

- **What's happening:** the deploy graph is closing the remaining gaps Octavia needs *before* anyone tries to stand up an end-to-end LBaaS test. None of this exposes a user-facing API yet — it's foundation work. Three concrete moves: (a) Netbox now knows about an `octavia_mgmt` VLAN role so prefix → VLAN assignment can be automated for the Octavia management plane; (b) the Octavia Health-Manager K8s `Service` is now explicitly bound to the Cilium L2-announcer LoadBalancerClass; (c) the amphora flavour name → UUID resolution against Nova has been wired (PR #649, dated mid-April but referenced in the current branch tree).
- **PRs / commits:**
  - `irobox @ 3d922870` — **PR #656** `fix(netbox-initializers): Add missing prefix vlan role for octavia` — adds `octavia_mgmt` to `hieradata/netbox/prefix_vlan_roles.yaml`. Tiny one-line change; large operational implication.
  - `irobox @ 4a634f9f` — **PR #646 SOV-668** `fix(cilium): Add explicitly spec.loadbalancerclass in LB` — also touches `fleet-infra/terraform/modules/openstack/octavia/octavia-health-manager-service.tf` with a new `hm_service_lb_class` var (defaults `io.cilium/l2-announcer`). Same change applied to ~20 other `Service type=LoadBalancer` definitions, including Traefik default / public / IPMI / compute-mgmt, Neutron, Nova, Netbox, Ragnarok api-server, KMS, log-forwarder, service-lb (opcp-artifacts).
  - `irobox @ e81632e0` — **PR #649** (already merged on master at the point of survey) `Resolve octavia amp_flavor_name to a UUID via the Nova API` — referenced in passing; the resolved UUID is what Octavia stores in its config.
- **Implications for Network Service planning:**
  - **Octavia HM Service today rides Cilium L2-announce, NOT a dedicated Octavia VIP.** This makes the HM reachable from amphorae on the management network via the cluster's L2 announcement. For our planning: the **VIP-on-active**, **active port**, and **standby port** for tenant LBs are a separate concern from this control-plane HM service. The brief lists three ports per LB — they are not the same three ports as in this commit.
  - **The amphora flavour lifecycle is already in the deploy graph** (resolved by name → Nova UUID). When we pick S/M/L flavour names from the FDD §7.2 spec, we'll wire them the same way.
  - **`octavia_mgmt` VLAN role exists in Netbox** → the Octavia management network gets a deterministic VLAN role. Worth confirming whether **a separate VLAN role for the LB tenant-data plane** is also needed (probably yes — open question).
- **Cross-refs:** brief [§Octavia / Deployment on OPCP](../source-material/product-brief-2026-06-08.md#deployment-on-opcp--cloudstore); CB FDD v0.4 §7.2 (active/standby + S/M/L); SOV-668.

### Theme 2 — Neutron L3 / OVS reliability + VLAN-range refactor

- **What's happening:** two operational pain-points were fixed and one structural cleanup landed — all of them affect the L3 Gateway substrate (the Octavia L3 router story rides on top of Neutron and ML2/OVS today, with OVN migration in WIP but not merged). The reliability fixes harden the agent's RPC handshake; the VLAN refactor changes how range constraints are *declared* in hieradata so they can be overridden per environment cleanly.
- **PRs / commits:**
  - `irobox @ 8b44f5ad` — **PR #684 SOV-784** `fix(neutron): Add ovs-agent init_container`. The dedicated `ovs-agent` thread that subscribes to per-port fanout queues (`neutron-vo-Port-1.10`, etc.) does not retry on RabbitMQ failure. A new `ovs-agent-pre-start.sh` init container polls AMQP for up to 900s before letting the main container start. Files: `bin/ovs-agent-pre-start.sh` (new, 27 lines) + `ovs-agent-daemonset.tf` (+54 lines wiring the initContainer).
  - `irobox @ 0cc7ffec` — **PR #703 SOV-918** `fix(neutron): check ovs queue on api readiness probe`. A new `api-readiness.py` (140 lines) verifies BOTH (1) the RPC transport is reachable AND (2) the stable fanout queue `q-agent-notifier-tunnel-update_fanout` exists (i.e., at least one ovs-agent has subscribed). Without (2), the Neutron API would accept port-create requests before any agent could hear them, causing silent data loss. Liveness keeps the lighter RPC-only check.
  - `irobox @ 6e0e4d1c` — **PR #705** `refactor(neutron-vars): Allow to redefine vlan ranges cleanly`. Promotes the literal `physnet1:199:665,physnet1:667:3999` string to a top-level `neutron_ml2_network_vlan_ranges` hieradata key (+ matching `neutron_ml2_ovh_vlan_ranges` for OVH-specific overrides). Range string is now `lookup`-resolved inside `ml2_plugins_conf`.
  - `fleet-infra-snc-hieradata @ c24e546c` — **PR #98** `fix(snc): Reserve vlan ranges for customer pods`. Uses the new override hook (PR #705 above) on every SNC NUC (`snc-gra-nuc1`, `snc-rbx-nuc1..nuc4`) to **carve out OOB VLAN slots** by splitting the range — e.g., `physnet1:199:299,physnet1:301:665,physnet1:667:3999`. The carved-out VLANs (300, 666 in each case + an extra ~3755 on nuc2) are reserved for customer-pod isolation.
- **Implications for Network Service planning:**
  - **L3 Gateway depends on Neutron coming up healthy.** Both reliability fixes close fail-open holes the LB / Gateway stand-up would otherwise hit — particularly first-deploy where Octavia spins up amphorae very early.
  - **VLAN allocation is now a per-environment knob.** When Network Service docs talk about "isolated aggregate" + "dedicated VLAN" for amphorae, the override path already exists — we just need to define our own range key per CloudStore env.
  - **OVN migration is WIP but not merged** (multiple `wip(neutron-ovn-migration): …` commits in branches; not in `HEAD..origin/master`). Worth pinning down with the Neutron / SDN owners whether the LB/Gateway project should target OVS (current) or wait for OVN.
- **Cross-refs:** brief [§Octavia / Network](../source-material/product-brief-2026-06-08.md#network); SOV-784; SOV-918.

### Theme 3 — Gateway API / HTTPRoute is the new exposure standard (opcp-infra-api · backup · ragnarok)

- **What's happening:** the OPCP team is moving every cluster-internal control-plane API surface off `networking.k8s.io/v1 Ingress` and onto `gateway.networking.k8s.io/v1 HTTPRoute`. The `opcp-infra-operator` Helm chart now ships both side-by-side (no enforced mutual exclusivity — migrations can run both at once). Same migration pattern applied to the bootstrap-flow seed scripts and the ragnarok bootstrap listener. **For the Network Service this matters in two distinct ways:** (a) Octavia's own control plane will need an exposure pattern too — and (b) the Network Service is the customer-facing equivalent of a Gateway (a real LB / L3 router), so the team's mental model is already trained on Gateway-API semantics.
- **PRs / commits:**
  - `opcp-infra-operator @ 750f52b` — **PR #18** `feat(chart): support both Ingress and HTTPRoute for opcp-infra-api exposure`. New `charts/opcp-infra-operator/templates/infra-api-httproute.yaml`. Values tree `infraApi.httpRoute.{enabled,parentRefs,hostnames,annotations,pathPrefix}` — Gateway must already exist (chart never creates it). Documented in `docs/opcp-infra-api.md` (renamed *"Ingress Exposure"* → *"External Exposure"*).
  - `opcp-infra-operator @ e50f9c0` — `feat(chart): expose Gateway API HTTPRoute filters for opcp-infra-api`. Adds `infraApi.httpRoute.filters` (free-form list, forwarded verbatim to `spec.rules[0].filters`). Common use-case: attach a Traefik middleware via `ExtensionRef`.
  - `opcp-infra-operator @ 155354d` — `feat(chart): HTTPRoute supports a list of rules with per-rule filters`. Refactors `httpRoute.rules` into a list — each entry has its own `pathPrefix` + own `filters`. Use-case: oauth2-protect `/` while leaving `/api` unauthenticated at the gateway (the API authenticates clients itself).
  - `irobox @ e1fa15fd` — **PR #664** `fix(backup): seed.sh use gateway object instead ingress object to read endpoint`. The backup-restore `seed.sh` now reads `KEYCLOAK_INGRESS` from the Traefik **Gateway listener** hostname (and `KEYSTONE_INGRESS` from an HTTPRoute) instead of from Ingress objects. New `GATEWAY` env-var defaults to `default` (mgmt) — switchable to `public`.
  - `irobox @ ba266dd8` — **PR #658** `fix(ragnarok): expose bootstrap service over HTTP in traefik gateway`. Adds a `ragnarok-bootstrap-http` listener on the default Gateway and wires the bootstrap HTTPRoute to it alongside the existing HTTPS listener — needed to allow re-bootstrap from scratch (HTTPS chicken-and-egg).
  - `opcp-infra-operator @ 321ef3a` — **PR #26 SOV-823** `feat(opcp-infra-status-agent): create the agent`. Separate but related — new `cmd/opcp-infra-status-agent/main.go` binary; touches the same chart and adds an openspec spec. Surfaces a `StatusAgent` deployment that calls back into `opcp-infra-api` over the in-cluster Service. Not on the Network Service critical path, but it's the second consumer of the same Gateway-API exposure work.
- **Implications for Network Service planning:**
  - **Octavia control-plane API exposure will reuse this same `httpRoute` pattern** (assuming we converge on Traefik / a Gateway-API-compliant data plane). FDD §7.2 mentions the Octavia API needs Keystone auth — the per-rule filter capability already covers that case (oauth2 / forward-auth on one path, raw on another).
  - **"Gateway" is overloaded** in our terminology: the brief uses "Gateway" for the **Neutron L3 router** (mainstream UX name); the OPCP code uses "Gateway" for the **Kubernetes Gateway API object** (Traefik / Cilium / Envoy gateway). The two must be kept distinct in our docs and in the project's open-questions file.
  - **Ingress→HTTPRoute migration is in-flight, not done.** Two paths exist; we should not block the Network Service on Ingress deprecation — but every new API exposure we add should be HTTPRoute first.
- **Cross-refs:** SOV-218 ("deploy + expose opcp-infra-api via HTTPRoute"); SOV-731 (M2 endpoint exposure via SNC proxies for cs-cp / cbs-cp — relevant because the same proxies will likely front the Octavia API).

### Theme 4 — Cilium `LoadBalancerClass` lock-in for control-plane LBs

- **What's happening:** a single PR (irobox #646, SOV-668) systematically added `spec.loadBalancerClass` to every K8s `Service type=LoadBalancer` in the platform. Default value is `io.cilium/l2-announcer`. A migration ansible play deletes pre-existing LB Services without a class (so K8s re-creates them with the class set). This is the **K8s-internal LB primitive** for cluster-IP exposure of control-plane components — it has nothing to do with tenant-facing Octavia LBs.
- **PRs / commits:**
  - `irobox @ 4a634f9f` — **PR #646 SOV-668**. 27 files changed: 12 K8s `Service` definitions (Octavia HM, Traefik default/public/IPMI/compute-mgmt, Neutron, Nova, Netbox, KMS, log-forwarder, Ragnarok api-server, service-lb), 4 Terraform modules (`chrony`, `extern-dns`, `ironic`, `octavia`) each with a new `<svc>_lb_class` variable (default `io.cilium/l2-announcer`), 1 ansible role + migration script (`migration-cilium-lb-without-class.yml`).
- **Implications for Network Service planning:**
  - **Two distinct LB layers** must be kept rigorously separate in our docs:
    1. **`io.cilium/l2-announcer`** — K8s primitive used by control-plane Services inside the OPCP-Core cluster. NOT user-facing.
    2. **Octavia** — tenant-facing LBaaS: amphorae VMs on Nova, VIP via Neutron port allocation, HAProxy on the amphora dataplane.
  - The brief mostly stays clear of this distinction because it focuses on the Octavia (#2) layer. But our open-questions doc should make the split explicit on day one.
  - **Any new K8s `Service` the Network Service introduces** (e.g., the Octavia API service if Octavia control-plane runs in-cluster) must set `loadBalancerClass: io.cilium/l2-announcer` to match the pattern.
- **Cross-refs:** SOV-668; brief [§OpenStack dependencies](../source-material/product-brief-2026-06-08.md#openstack-dependencies-full-list) (Neutron + Nova feed Octavia).

### Theme 5 — Floating IPs surfaced as outputs + L2/L3-specific proxy egress rules

- **What's happening:** `terraform-modules-snc/paas-snc-proxy-tf/` is the module that provisions the SNC dataplane proxy + control-plane proxy VMs (Caddy-based) on top of OpenStack. Two relevant moves: (a) the **L3** proxy frontend floating-IPs (global-cp, regional-cp, dp variants) are now exposed as Terraform outputs so downstream consumers can pin DNS / FW rules against them; (b) the previously-shared `extra_<scope>_backend_fw_egress_rules` variable was **split into L2- and L3-specific copies** (`extra_global_l2_backend_fw_egress_rules`, `extra_global_l3_backend_fw_egress_rules`, and the regional counterparts), so an operator can grant backend egress to an L3 proxy without leaking the same rule to the L2 proxy.
- **PRs / commits:**
  - `terraform-modules-snc @ c1cb4cd` — `add floating ips to output` (Thomas Wiebe). Adds `global_l3_cp_proxy_frontend_floating_ips`, `regional_l3_cp_proxy_frontend_floating_ips`, `l3_dp_proxy_frontend_floating_ips` to `outputs.tf`.
  - `terraform-modules-snc @ 68cd676` — `fix(proxies): separate extra_regional_backend_fw_egress_rules and extra_global_backend_fw_egress_rules to l2 and l3 specific variables` (Sammy Debbiche). Renames the variable in four proxy-group files + four secgroup files + the `user-data/proxy.yaml.tftpl` cloud-init template.
  - `terraform-modules-snc @ 4987562` / `8275df6` / `2de2474` — oauth2-proxy endpoint on regional L2 / global L2 (latter reverted). Adds an `oauth2_proxy` service-map entry that routes `admin.${region}.${base_url}:443` through a backend on the L2 cp proxy, terminating TLS at the proxy with `oauth2-proxy-certs` from `identity-l2` namespace.
  - `terraform-modules-snc @ 6999f5e` — `Add horizon to CORS` (one-line, but worth knowing: Horizon UI is being exposed via the same proxy chain).
- **Implications for Network Service planning:**
  - **Tenant-facing Octavia LB frontends will need floating IPs allocated from the same FIP pool** the proxies draw from. The new outputs are the consumption pattern downstream cloudstore-service TF modules should follow.
  - **FIP scarcity in airgapped deployments** (called out in our placeholder README) is now more concrete: the L3 proxies *also* consume FIPs, so the Network Service quota must coexist with proxy quota.
  - **Proxy backend FW egress rules are now L2/L3-aware** — if Octavia API is fronted by the L3 cp proxy (likely, since Octavia is in the control plane), we'll use `extra_global_l3_backend_fw_egress_rules` (or the regional equivalent) to permit traffic from proxy to Octavia.
  - **oauth2-proxy at the L2-cp proxy** terminates Keystone-issued tokens for Horizon-style admin UIs. Octavia's UI (per the brief, in OPCP IT-Admin user-story) might want to ride this same auth path. Open question.
- **Cross-refs:** brief [§Floating IP](../source-material/product-brief-2026-06-08.md#network) ("Floating IP — public IP NAT'd to a private IP on the compute/network node, not on the VM itself"); SOV-731 (M2 endpoint exposure via SNC proxies); SOV-715 (cbs-cp + cs-cp proxies).

### Theme 6 — Hieradata / dev-env knobs (apiproxy reroute, swagger flip)

- **What's happening:** smaller fleet-infra changes that affect deployment-knob shape for any new control-plane service. Two relevant moves: (a) the `minint` env now exposes an api-proxy for MKS ClusterAPI on a new network (PR #700) and was later re-pointed at the `mgmt` network on `dc2f9321-aa8a-4fc4-9d46-11688e7a5a95` (PR #709); (b) Swagger UI is enabled for the `opcp-infra-operator` API on all dev envs via a global hieradata flip.
- **PRs / commits:**
  - `fleet-infra-hieradata @ 49bbb7b0` — **PR #700 (Alexandre Arents)** `feat(minint): add apiproxy for mks clusterapi`. New `apiproxy.config.mks_clusterapi_cluster_kubeadmin` entry in `gor-minint.yaml` with its own `network_uuid`.
  - `fleet-infra-hieradata @ 118c626b` — **PR #709 (Pierre-Yves Aillet)** `fix(minint): update the network on which the api-proxy is exposed for mks`. Renames `mks_ext` to `mgmt` and points it at a different `network_uuid`.
  - `fleet-infra-hieradata @ 7915c417` — `feat(opcp-infra-operator): enable the opcp infra operator swagger on all dev environments`. Sets `opcp_infra_operator.api.swagger_enabled: true` in `hieradata/dev/common.yaml`.
- **Implications for Network Service planning:**
  - **The same apiproxy / network mapping pattern is how new Network-Service control-plane endpoints will likely be wired through to admin networks.** The fact that `mks_ext` was renamed to `mgmt` is a small style signal — naming follows the network function, not the consumer.
  - **Swagger-on-dev-only** is the team's standing convention. When the Network Service ships its own API (Octavia API surface), default to Swagger off in non-dev.
- **Cross-refs:** brief [§OPCP IT Administrator user-stories](../source-material/product-brief-2026-06-08.md#opcp-it-administrator); not directly Jira-keyed.

## Open questions raised by the survey

1. **VLAN role for the LB tenant-data plane** — `octavia_mgmt` exists for the management plane. Does the LB **data plane** (amphora client-network port) also warrant its own Netbox VLAN role, or does it land on an existing tenant VLAN role? *(Theme 1)*
2. **OVS vs OVN target for L3 Gateway** — multiple `wip(neutron-ovn-migration)` branches exist (not merged). Should the Network Service M0 target current ML2/OVS or wait for OVN? *(Theme 2)*
3. **Per-environment VLAN-range override for the Network Service aggregate** — should we define a `neutron_ml2_network_vlan_ranges` override for the LB / Gateway aggregate, or rely on the pod-level reservation already in place? *(Theme 2)*
4. **Octavia control-plane exposure pattern** — Ingress, HTTPRoute, or via the L3-cp proxy + Traefik middleware chain (oauth2)? Brief says "Octavia API only" for end-users — implies external exposure. *(Theme 3 + Theme 5)*
5. **Two meanings of "Gateway"** — confirm we'll consistently distinguish *Neutron L3 Router ("Gateway" in mainstream UX)* from *Kubernetes Gateway-API Gateway* in all Network-Service docs and tickets. *(Theme 3)*
6. **Default `loadBalancerClass` for any Network-Service control-plane Service** — assume `io.cilium/l2-announcer` unless there's a reason to override (e.g., if we choose to use a different LB implementation for the Octavia HM cluster Service)? *(Theme 4)*
7. **FIP pool coexistence** — proxy VMs already consume FIPs from the same pool the LB frontends will pull from. Quota math + airgap pool sizing needs to land in the planning artefacts. *(Theme 5)*
8. **oauth2-proxy reuse for Octavia API** — does the IT-Admin Octavia UI flow ride the existing `oauth2_proxy` chain (L2-cp proxy + admin DNS), or stand up its own? *(Theme 5)*
9. **Barbican placement** — brief lists Barbican as a hard Octavia dependency (TLS-cert storage). Survey found no Barbican code in this window. Where does Barbican live in the OPCP topology — opcp-core, network-service-cp, or new? *(brief gap, not theme-tied)*

## Cross-references

- **Product brief (just distilled):** [`source-material/product-brief-2026-06-08.md`](../source-material/product-brief-2026-06-08.md).
- **Project dashboard (placeholder):** [`README.md`](../README.md).
- **CB FDD v0.4 §7.2** — L3 Network Services (Octavia HA active/standby, S/M/L flavours, full protocol matrix, L7 policies, horizontal backend scaling).
- **Prior code survey (CB-side, 2026-05-11):** [`kb/projects/compute-block-on-cloud-store/architecture/code-survey-2026-05-11.md`](../../compute-block-on-cloud-store/architecture/code-survey-2026-05-11.md) — used as format template.
- **Related Jira threads:**
  - LVL2-22123 — Network-Services outer Epic (named in brief).
  - SOV-218 — opcp-infra-api deploy + HTTPRoute (already merged on master upstream of this window).
  - SOV-668 — Cilium `LoadBalancerClass` explicit.
  - SOV-731 — M2 endpoint exposure via SNC proxies.
  - SOV-715 — cbs-cp / cs-cp proxies.
  - SOV-784 — Neutron RPC readiness / ovs-agent init container.
  - SOV-823 — opcp-infra-status-agent.
  - SOV-918 — Neutron API readiness fanout-queue check.

## Methodology notes

I scanned `git log HEAD..origin/<branch> --oneline` on each of the five repos (131 commits total), filtered by an LB/Gateway keyword regex (`octavia|loadbalanc|lbaas|amphora|neutron|gateway|httproute|cilium|floating|l3|router|proxy|haproxy|vlan|apiproxy|opcp-infra`), and read in depth the 17 PRs / loose commits surfaced. I did not read the full diff of the larger PRs (notably PR #646's 27 files, and the SOV-823 status-agent's 78 files) — only the load-bearing files for each theme.

Skipped intentionally: pure dependency bumps, CI / Sonar tweaks, security CVE backports, formatting-only changes, doc-only release-note updates (release 3.0.1 / 3.0.2 / 3.0.3 notes). Also skipped: the WIP `neutron-ovn-migration` work (multiple branches, not merged to master in this window — surfaced as open question 2). The SOV-218 PRs ([#650 + #653](SOV-218)) landed *just* before the survey window and are referenced as context for Theme 3 but not re-surveyed.

Uncertainty: Barbican is named as a hard Octavia dependency in the brief, but I found zero Barbican-specific code in this window. Either Barbican is already in place (pre-window) or it has not been wired yet — worth pinning down with Damien / Florent.

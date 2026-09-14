---
id: object-storage-on-cloud-store/jira-sov-2019-input-variable-cleanup
type: jira
diataxis: reference
title: "SOV-2019 — [MS1][OS Package] Clean up the deploy-time input variables (post-POC)"
owner: sov-copilot
status: draft
publish_target: git
product: cloudstore
---

# Jira [`SOV-2019`](SOV-2019) — `[MS1][OS Package] Clean up the deploy-time input variables (post-POC)`

> **Type:** Task · **Status:** Backlog · **Created:** 2026-07-29 · **Assignee:** Unassigned ·
> **Watcher:** Zafar Akhtar *(added for the app-cred evaluation ask)*.
> **Epic Link:** [`SOV-853`](SOV-853) `[MS1][OS Package] Development`.
> **User-story Epic:** [`SOV-849`](SOV-849). **Outer parent:** `LVL2-18375`.
> **⏳ Sequencing: to be done AFTER the POC phase ends.** Several items only make sense once we're no longer
> deploying the POC shape.

---

## Goal

The package asks the deployer for an input set that **overwhelms a normal user and sits outside their
knowledge**. Some inputs are POC-only and should be removed or prefilled once the POC ends; some duplicate
values the platform already holds and should be auto-injected; and some carry POC-baked defaults that will
mislead or break the first production deploy.

This ticket reduces the deploy-time input surface to what a deployer can reasonably be expected to know and
decide.

## Verified inventory — 2026-07-29

`origin/main` @ `75497e8`, release `0.2.0-alpha.18`. The package declares **44 controlplane TF variables**, of
which **15 are exposed as `cloudstore.yaml` `control.inputs`**. `ca_crt` is `provided: true`
(platform-injected), so **14 land on the deployer**. All dataplane inputs are `provided: true` → no user burden
there.

### The 14 a deployer fills in today

| Input | Default | Verdict |
|---|---|---|
| `openstack_auth_url` | `https://keystone.demo.bmp.ovhgoldorack…` | 🔴 POC default (demo BMPOD) + Zafar ask |
| `openstack_application_credential_id` | `null` 🔒 | ❓ **Zafar ask** |
| `openstack_application_credential_secret` | `null` 🔒 | ❓ **Zafar ask** |
| `floating_ip_address` | `""` | 🔴 **POC** — manifest: *"floating IPs needs to be provided manually for now"* |
| `floating_ip_address_ceph` | `""` | 🔴 **POC** — same |
| `ovh_application_key` | *none* 🔒 | 🟠 → auto-inject (Decision 3) |
| `ovh_application_secret` | *none* 🔒 | 🟠 → auto-inject |
| `ovh_consumer_key` | *none* 🔒 | 🟠 → auto-inject |
| `domain` | `cloudstore.ovh` | ✅ → platform-injected (Decision 1) |
| `environment` | `dev` | ✅ → platform-injected (Decision 1) |
| `ceph_mon_node_count` | `3` | ✅ keep + validate (Decision 2) |
| `ceph_osd_node_count` | `4` | ✅ keep + validate (Decision 2) |
| `my_ca_cert` | `""` 🔒 | ❓ **OPEN** (Decision 4) |
| `my_ca_key` | `""` 🔒 | ❓ **OPEN** (Decision 4) |

### POC-baked defaults on the 29 non-exposed variables

No user burden today, but they bake the POC in:

| Variable | Default | Problem |
|---|---|---|
| `ceph_flavor_mon_nodes` · `ceph_flavor_osd_nodes` · `ceph_flavor_oob` | all `b3-8` | 🔴 **VM flavors, not bare-metal** |
| `volume_type` | `public_standard` | 🔴 **OSDs on Cinder volumes**, not local drives |
| `ceph_osd_volume_size` | `10` GB | 🔴 POC scale |
| `ceph_system_volume_size` | `20` GB | 🔴 POC scale |
| `external_network_id` | hardcoded UUID `1f608252-…` | 🔴 Env-specific literal |
| `openstack_region` | `demo` | 🔴 The demo BMPOD |
| `image_name` · `ceph_image_name` | `Ubuntu 24.04 BMPOD` · `Debian 12 BMPOD` | 🔴 BMPOD images |
| `deployment_id` | `poc` | 🔴 Literally |
| `allowed_admin_cidr` | `0.0.0.0/0` | 🔴 **Security** — can't tighten, tf-runner IP unknown |
| `ceph_osd_spec_file` | the loose take-every-disk spec | 🔴 → [`SOV-2009`](SOV-2009-role-flavor-osd-specs.md) |
| `ceph_node_exporter_enabled` | `false` | 🟠 Observability off by default |

> **🚨 The structural finding.** `prerequisites.description` reads *"An OpenStack project (a VM is provisioned;
> no bare-metal pool required)"* — contradicting the M1 architecture (≥4 BM nodes, ≥5 data drives each). **The
> whole Ceph layer runs on VMs with Cinder-volume OSDs today.** That's the POC shape, which means *input cleanup*
> and *moving off the POC shape* are the same body of work — and it interlocks with
> [`SOV-2009`](SOV-2009-role-flavor-osd-specs.md)'s role-flavor matrix.

## Decisions taken (Jan Stuhlmann, 2026-07-29)

| # | Decision |
|---|---|
| **1** | **`domain` + `environment` → platform-injected**, same treatment as `service` / `deployment_id`. CloudStore knows the target environment and DNS zone. *Removes 2 inputs.* |
| **2** | **`ceph_mon_node_count` / `ceph_osd_node_count` stay as raw counts** — an IT-Admin sizing a storage cluster reasonably picks node counts. Add validation (odd mon count for quorum, `osd_count ≥ mon_count`) + better descriptions instead of hiding them. |
| **3** | **The three `ovh_*` DNS credentials are in scope here** — this ticket drives getting them into the CloudStore auto-inject catalog, coordinating with the platform team. The manifest already notes they're the *"same values as the platform's `externaldns-provider-ovh-credentials` secret"*, just not in the catalog. *Removes 3 sensitive inputs.* |
| **4** | **`my_ca_cert` / `my_ca_key` — 🔓 OPEN → now tracked as OSQ-35 / [`SOV-2021`](SOV-2021).** *"How will SSL certificates be issued in future — CloudStore feature, OVH PKI service, or BYO-CA kept properly?"* Leading candidate: keep BYO-CA as the design but have **CloudStore supply the CA** rather than the deployer pasting base64 PEM. **Decide there before implementing here** — it determines whether these are removed, injected, or kept. ⚠️ SOV-2021 also surfaced that **every leaf is minted for 10 years with no renewal path**, which is a bigger problem than the input surface. |

## For Zafar Akhtar — evaluation ask

`openstack_auth_url`, `openstack_application_credential_id` and `openstack_application_credential_secret` are
declared **editable** by the customer. The `cloudstore.yaml` comment reads:

> *"OpenStack credentials — EDITABLE (default to the injected value in variables.tf, but the deployer can
> override per the task contract), so `{}` rather than `provided`."*

**Do these actually need to be customer-editable, and why?** If the platform injects working credentials,
letting a customer override them adds surface area, invites misconfiguration, and puts an OpenStack concept in
front of someone who shouldn't need to know it. If there *is* a real reason — a task-contract requirement, a
break-glass path, multi-project deploys — it should be stated and documented so it's kept deliberately.
Otherwise they become `provided: true` and drop off the user surface, **removing 3 more inputs**.

⚠️ **Delivery note:** the inline `[~user]` mention was stripped to plain text by the Markdown→wiki converter, so
Zafar was added as a **watcher** instead to guarantee notification.

## In scope

- Reduce `control.inputs` to what a deployer can reasonably know and decide, per the decisions above.
- Remove or prefill the POC-only inputs (`floating_ip_address`, `floating_ip_address_ceph`, and the POC-baked
  defaults table).
- Replace env-specific literals (`external_network_id`, `openstack_region`, the BMPOD image names) with injected
  values or documented per-environment configuration.
- Add validation + human-readable descriptions to every remaining input.
- Make the remaining input set **documented and discoverable** — a deployer shouldn't read Terraform to find out
  what to supply.
- Correct `prerequisites.description` to match the real production prerequisite once Ceph moves off VMs.

## Out of scope

- Role-flavor → OSD-spec mapping and `ceph_osd_spec_file` — [`SOV-2009`](SOV-2009-role-flavor-osd-specs.md).
- Hardened container base images — [`SOV-2015`](SOV-2015) / OSQ-34.
- **Actually moving the Ceph layer from VMs to bare metal** — that's the POC exit itself, which this ticket
  *follows* rather than performs.
- Tightening `allowed_admin_cidr` — blocked on knowing the tf-runner IP; belongs with `SOV-1530`.

## Definition of Done

1. Every remaining `control.inputs` entry is one a deployer can reasonably be expected to know, with a clear
   description and validation where a wrong value is possible.
2. `domain` + `environment` are platform-injected, not deployer inputs.
3. The three `ovh_*` credentials are in the auto-inject catalog and removed from `control.inputs`.
4. `ceph_mon_node_count` / `ceph_osd_node_count` validate odd mon count and `osd_count ≥ mon_count`, and their
   descriptions explain the sizing consequence.
5. Decision 4 is resolved and implemented for `my_ca_cert` / `my_ca_key`.
6. Zafar's evaluation of the `openstack_application_credential*` editability is recorded, and the variables
   either become `provided: true` or carry a **documented reason** for staying editable.
7. No POC-only input remains without either removal or a production-correct prefilled default.
8. No env-specific literal (network UUID, region, image name) remains as a hardcoded default.
9. `prerequisites.description` matches the real production prerequisite.
10. The remaining input set is documented **outside** the Terraform.

## Links

- Parent Epic: [`SOV-853`](SOV-853) `[MS1][OS Package] Development` ·
  mirror [`SOV-853-ms1-os-package.md`](SOV-853-ms1-os-package.md)
- User-story Epic: [`SOV-849`](SOV-849)
- Related: [`SOV-2009`](SOV-2009-role-flavor-osd-specs.md) *(shares the Ceph flavor variables)* ·
  [`SOV-2015`](SOV-2015) / OSQ-34 *(container base
  images)* · [`SOV-1530`](SOV-1530) `[OS] Security hardening`
  *(`allowed_admin_cidr`, Keystone exposure)* · [`SOV-1260`](SOV-1260)
  *(cloudstore.yaml docker-image dependency rework)*
- **Package state evidence:** [`architecture/object-storage-package-survey-2026-06-10.md`](../architecture/object-storage-package-survey-2026-06-10.md)
  — 2026-07-29 re-survey delta
- Package code: `cloudstore-service-object-storage` — `cloudstore.yaml` `control.inputs` ·
  `terraform/controlplane/variables.tf`

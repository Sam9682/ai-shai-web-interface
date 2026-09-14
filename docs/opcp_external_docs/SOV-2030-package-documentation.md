---
id: object-storage-on-cloud-store/jira-sov-2030-package-documentation
type: jira
diataxis: reference
title: "SOV-2030 — [MS2][OS] Create the package documentation (terraform-docs + service-level docs)"
owner: sov-copilot
status: draft
publish_target: git
product: cloudstore
---

# Jira [`SOV-2030`](SOV-2030) — `[MS2][OS] Create the package documentation (terraform-docs + service-level docs)`

> **Type:** Task · **Status:** Backlog · **Created:** 2026-07-29 · **Assignee:** **Jan Stuhlmann**.
> **Epic Link:** [`SOV-850`](SOV-850) `[MS2][OS] Activate Object Storage for a
> Customer` *(the M2 work-block Epics are each too narrow — see the standing exception in
> [`jira/README.md`](README.md))*. **Outer parent:** `LVL2-18375`.
> **Process:** [`howto_generate_service_documentation`](https://cloudstore-service-packager-documentation.pages.ovhcloud.tools/latest/howto_guides/howto_generate_service_documentation/)
> — also vendored in the package at `docs/howto_guides/howto_generate_service_documentation.md`.

---

## ⚠️ Not to be confused with `SOV-1263`

[`SOV-1263`](SOV-1263-os-documentation.md) `[DOC] Object Storage — Documentation` *sounds* like this ticket but is
a different job: distilling **design inputs into our own workspace KB** (the GSSNC-411 HLD, a
`ceph-rgw-sizing.md` reference, capturing KB0065306). **This** ticket is documentation **shipped with the service
package**. Both stay open.

## Goal

Produce documentation for the Object Storage service package, following the CloudStore Service Packager process.

## Verified starting point — 2026-07-29 (`origin/main` @ `0.2.0-alpha.18`)

> **📌 The generation mechanism from that howto is already fully wired.** The process is much narrower than
> "write documentation" — it's `terraform-docs` rendering the Terraform variables + outputs into two files.

| Piece | State |
|---|---|
| `terraform/controlplane/README.md` | ✅ Exists, 192 lines |
| `terraform/dataplane/README.md` | ✅ Exists, 76 lines |
| `make tf_docs` target | ✅ Exists (`.makefiles/terraform.mk`) |
| `.terraform-docs.yml` | ✅ Exists — default config, no change needed per the howto |
| `.pre-commit-config.yaml` | ✅ Exists |
| `.cds/workflows/documentation.yml` | ✅ Exists — the Stash CI variant, **triggered on pull request** |
| `docs/.header.md` | ⚠️ Exists but is **still the bare default** — service name + the one-line `service_description` |

**So there are two real gaps, and neither of them is the mechanism.**

### 🔴 Gap 1 — the generated docs are stale

`terraform/controlplane/README.md` does **not** contain `ceph_flavor_mon_nodes`, `ceph_flavor_osd_nodes` or
`mon_node_count` — all added in commit `b4c3ffd`. The committed output no longer matches the Terraform it
documents.

**Likely cause:** the CDS workflow triggers **on pull request**, while the repo is developed with direct pushes
and merge-of-main commits, so the PR trigger never fires. ⚠️ *Worth confirming rather than assuming* — the
workflow may also be failing, or simply not have been triggered for that change.

**This is the cheapest fix in the ticket:** run `make tf_docs`, enable the pre-commit hook (the config already
exists), or change the trigger.

### 🔴 Gap 2 — there is no Object-Storage-specific documentation at all

The `docs/` tree is **entirely the copier template's own documentation about how to use the packager** —
`expl_service_package.md`, `howto_package_a_service.md`, `ref_cloudstore_yaml.md`,
`tuto_first_service_package.md`… Useful to a *package author*, but it documents the **packager**, not **this
service**.

The only repo-authored doc is `docs/provisioning-approach.md`, and it's **stale** — still marks the Ceph deploy
mechanism "OPEN", pre-dating the [2026-06-09 CephADM + Ansible decision](../decisions.md). Already flagged in the
[package survey](../architecture/object-storage-package-survey-2026-06-10.md).

**`terraform-docs` cannot close this gap by construction** — it renders variables and outputs, so it can say
*what* `ceph_osd_spec_file` is, never *how to operate an Object Storage cluster*.

## In scope

- Bring the two generated READMEs back in sync, and **make staleness not recur** — pre-commit hook, a different
  CI trigger, or a documented manual step.
- Replace the default `docs/.header.md` with a real service header — it fronts **both** generated documents.
- Write the **service-level** documentation that doesn't exist: what an operator needs to install, activate,
  operate and troubleshoot Object Storage, in the **diátaxis** split the template already establishes
  (tutorials / howto / reference / explanation).
- Update or retire `docs/provisioning-approach.md`.
- Decide what belongs in the **package repo** vs **this workspace KB**, and cross-link rather than duplicate.

## Out of scope

- Workspace-KB design-input distillation — [`SOV-1263`](SOV-1263-os-documentation.md).
- Customer-facing **end-user S3** documentation, if that's a Products deliverable rather than a package one.
  *Worth confirming.*

## Dependencies

- **[`SOV-2019`](SOV-2019-input-variable-cleanup.md) feeds the generated docs directly.** `terraform-docs`
  renders each variable's `description`, so SOV-2019's *"add human-readable descriptions and validation to every
  remaining input"* is what makes the generated reference readable. **Doing this first means documenting
  variables that are about to be removed or renamed.**
- Several behaviours worth documenting are **still open questions** — OSQ-30 (OOB node),
  OSQ-35 (certificates), OSQ-36 (Keystone exposure). Documenting
  the POC shape as though it were production would be **worse than leaving it undocumented** → mark POC status
  explicitly where it applies.

## Definition of Done

1. Generated Terraform documentation matches the current Terraform, **and** a mechanism prevents it drifting again.
2. `docs/.header.md` carries a real service header, not the template default.
3. Service-level documentation exists for install · activation · day-2 operation · troubleshooting, in the
   diátaxis structure.
4. `docs/provisioning-approach.md` updated or retired.
5. Anything POC-only is **explicitly marked** as such.
6. Cross-links to the workspace KB in place, no duplicated content.

## Links

- **Process:** [`howto_generate_service_documentation`](https://cloudstore-service-packager-documentation.pages.ovhcloud.tools/latest/howto_guides/howto_generate_service_documentation/)
  *(needs OVH SSO; the same content is vendored at `docs/howto_guides/howto_generate_service_documentation.md`)*
- Epic: [`SOV-850`](SOV-850) `[MS2][OS] Activate Object Storage for a Customer` ·
  mirror [`SOV-850-ms2-activate-customer.md`](SOV-850-ms2-activate-customer.md)
- **Distinct from:** [`SOV-1263`](SOV-1263-os-documentation.md) *(workspace-KB design inputs)*
- Related: [`SOV-2019`](SOV-2019-input-variable-cleanup.md) *(input descriptions feed the generated reference)* ·
  OSQ-28 *(Benjamin Hofer handover needs onboarding documentation)* ·
  [`SOV-2020`](SOV-2020) / [`SOV-2021`](SOV-2021) /
  [`SOV-2024`](SOV-2024) *(all describe behaviour not yet settled)*
- Package evidence: `docs/` · `.terraform-docs.yml` · `.cds/workflows/documentation.yml` · `.makefiles/terraform.mk`

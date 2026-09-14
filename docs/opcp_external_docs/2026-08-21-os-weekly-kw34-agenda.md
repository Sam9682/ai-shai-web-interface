---
id: object-storage-on-cloud-store/os-weekly-kw34-agenda
type: reference
diataxis: reference
title: "OS Weekly KW34 (2026-08-21) — agenda input: reopen the L2/L3 separation decision (OSQ-32)"
owner: sov-copilot
status: draft
publish_target: git
product: cloudstore
tags: [object-storage, weekly, osq-32, l2-l3-separation, agenda]
---

# 2026-08-21 — OS Weekly KW34 · agenda input

**Date:** 2026-08-21 (Friday) · **Format:** written input, submitted ahead of the meeting
**Raised by:** Jan Stuhlmann · ⚠️ **Jan likely absent** — hospital appointment
**Topic:** **OSQ-32 / SOV-1938 — L2/L3 separation**

> ℹ️ **This is an agenda item written *before* the meeting, not notes taken during it** — the other
> `os-weekly-*` files in this folder are retrospective. Jan probably cannot attend, so his position is
> recorded here in writing to be read into the discussion.
>
> **This is input to a discussion, not a decision and not a counter-decision.** The decision sits with
> Florent Thiery (Jira assignee) / the product line. Jan is explicit that it is not his call.

---

## 1 · Where the decision currently stands

**SOV-1938, Florent Thiery, 2026-08-06** — L2/L3 separation
is **mandatory for every service**:

> "we want OPCP and SNC to converge, and customers buy OPCP hoping to reach local SNC-like
> qualifications, so we must build security into the product from day one, and if these features prove to
> induce important additional costs, ideally these should be disableable behind a feature flag. The global
> thinking is: it's hard to add security after, easier to remove. That would mean that **yes, L2/L3
> separation is mandatory for each service**; service which support this natively may not need to use
> proxies, but the others, probably. Additionally, customers expect dedicated S3 endpoints too
> (i.e. tenant-dedicated)."

Earlier on the same ticket: **2026-07-24** Florent confirmed it as a core requirement and asked Zafar +
Stephan for (a) the cost overhead of the proxy fleet and (b) whether it can be made switchable. The
**KW30 weekly** answered both only partially — *"proxies are expected to be small instances… exact cost
not yet quantified"* and *"switchability… not yet formally defined"*. **Both follow-ups are still open**,
and the ticket is still `Backlog`.

## 2 · Jan's position — the decision is not settled enough to build on

**Ask: discuss this in the weekly before it hardens into a build assumption.**

| # | Objection |
|---|---|
| **1** | **The overhead is substantial and hasn't been quantified.** L2/L3 separation is not one flag — it implies **two Keystones**, one per plane, each with its own database and policy *(recorded on the ticket 2026-07-24)*, plus the proxy fleet, plus a routing layer that today does not exist. The cost question Florent himself raised on 07-24 is still unanswered — so "mandatory" is currently being decided **without** the number that the feature-flag caveat depends on. |
| **2** | **Jan is not convinced the separation is useful in OPCP.** In Object Storage terms it buys exactly one thing: an **admin-API endpoint separated from the user-facing S3 endpoint** *(the two RGW specs differ by a single token, `admin` in `rgw_enable_apis` — verified in the package, see below)*. Whether every OPCP customer needs that separation, as opposed to SNC-certified deployments, has not been argued on its merits. |
| **3** | **"Removing security later is easier than adding it" is too easy an argument.** It is true as a general principle and it is not free: it moves cost and complexity into every deployment now, on the assumption they can be removed later — and removal has its own qualification cost. Used as the deciding argument it ends debate rather than resolving it. |
| **4** | **For Object Storage specifically, SNC and OPCP are different implementations.** The convergence argument carries less weight here than it does elsewhere: inheriting SNC's separation model is not the same as inheriting a working SNC implementation, so the "replicate what SNC does" reasoning does not transfer directly. |

## 3 · The technical facts the discussion should have in front of it

Verified against the package, `origin/main` @ `0.2.0-alpha.18` (2026-07-29):

- **The two RGW specs differ by exactly one token** — the `admin` API:
  ```
  ansible-library-copy/roles/ceph/templates/rgw-l2-admin.yml.j2
    rgw_enable_apis: s3,s3website,admin,sts,iam
  ansible-library-copy/roles/ceph/templates/rgw-l3-user.yml.j2
    rgw_enable_apis: s3,s3website,sts,iam
  ```
  *(observable at runtime: `ceph config dump | grep api` on a mon node)*
  ⇒ **L2 = the RGW exposing the admin API · L3 = user-facing S3 only.** Everything else is identical.
- **The L2 RGW is stood up today but nothing routes to it** — the OOB HAProxy routes only to L3. An
  admin-API-enabled RGW with no route: harmless now, live surface the moment something routes there.
- **Logical separation is sufficient** — via Neutron/Cilium; physical hardware separation is *not*
  required. The one hard SNC rule is that **the proxy must never share a CPU with the backend**
  *(ticket, 2026-07-24)*.
- **New requirement in the 08-06 comment:** *tenant-dedicated S3 endpoints*. This is **not in scope
  anywhere in the current package or ticket set** — it needs its own question and its own sizing.

## 4 · What the meeting could usefully settle

| # | Question | Suggested owner |
|---|---|---|
| 1 | Do we accept "mandatory for every service" as **final**, or reopen it on the merits for Object Storage? | Florent Thiery *(decision)* |
| 2 | **Quantify the proxy-fleet / dual-Keystone overhead** — open since 2026-07-24 and it is the input the feature-flag caveat depends on | Zafar Akhtar · Stephan Hohn |
| 3 | Define the **switchability mechanism** concretely (what the flag actually turns off) | Zafar Akhtar |
| 4 | **Tenant-dedicated S3 endpoints** — accept as a requirement and open an OSQ, or park it? | Florent Thiery · Eddy Medina |
| 5 | If mandatory stands: who re-homes the L2 routing when the OOB node goes away? | ties to SOV-2020 / OSQ-30 |
| 6 | Set a **needs-by date** — OSQ-32's original KW28 date passed and it has been overdue since | Florent Thiery |

## 5 · Cross-links

- [`open-questions.md`](../open-questions.md) — the **OSQ-32** row *(canonical text)*
- SOV-1938 — the Jira mirror, decision owner **Florent Thiery**
- Knock-ons: SOV-2020 / OSQ-30 *(OOB re-home inherits the split)* · SOV-2024 / OSQ-36 *(exposure of the other admin-ish endpoint, Keystone)*
- [`handover-2026-08-jan-vacation.md`](../handover-2026-08-jan-vacation.md) — landmine **#6** is the unexposed L2 RGW
- Previous weekly: [`2026-07-10-os-weekly-kw28.md`](2026-07-10-os-weekly-kw28.md)

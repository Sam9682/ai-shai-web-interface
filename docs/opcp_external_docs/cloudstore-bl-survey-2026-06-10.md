---
id: compute-block-on-cloud-store/architecture-cloudstore-bl-survey-2026-06-10
type: deep-dive
diataxis: explanation
title: "Architecture — `cloudstore-bl` monorepo survey (2026-06-10)"
owner: sov-copilot
status: approved
publish_target: git
product: cloudstore
---

# Architecture — `cloudstore-bl` monorepo survey (2026-06-10)

> Re-survey of `ssh://git@stash.ovh.net:7999/cloudstore/cloudstore-bl.git`, cloned 2026-06-10 (shallow + 30-commit deepen). Goal: answer **Q-230** ("Do the OPCP-CloudStore L2/L3 BL service repos exist?") as far as the code allows — this materially affects **CB M3 BL sizing** (CLOUD-587 / CLOUD-589 / CLOUD-600 / CLOUD-616).
>
> **Supersedes the conclusion of** [`cloudstore-bl-survey.md`](cloudstore-bl-survey.md) (2026-05-13: "build tooling only"). The repo has since become **the BL squad's monorepo with real L2 service code** — but the code is a **consumption/usage-reporting pipeline, NOT the CAIM IDAM drone stack**.
>
> Companions: [`business-logic-iam.md`](business-logic-iam.md) (CAIM reuse map) · [`Business Logic & IAM Deep Dive`](../../../architecture/conceptions/business-logic-iam/summary.md).

---

## 1. What the repo is now (vs the 2026-05 state)

| | 2026-05-13 survey | 2026-06-10 (this survey) |
|---|---|---|
| **Content** | Build infrastructure only (Pants config, Makefile, CDS workflows, `bl-pants` Containerfile) | Build infra **+ `layer_2/services/` + `libs/`** — real Python source with tests |
| **Repo model** | Assumed "shared foundation repo + N future service repos" | **Monorepo** — services grow *inside* `cloudstore-bl` under `layer_2/services/<name>/`; the per-service-repo hypothesis is dead (and `cloudstore-bl-common` is still empty on remote, re-verified 2026-06-10) |
| **Domain** | Unknown | **Consumption / usage metering toward Agora (OVH billing)** — first ticket reference in history: `SOV-345` "consumption reporting script" |
| **Activity** | — | Active: ~30 commits 2026-05-13 → 2026-06-09, two authors (**Sebastian Windau**, **Lukas Langen**) |
| **CAIM / IDAM code** | None | **Still none** — zero grep hits for `drone`, `CAIM`, `idam`, `keycloak`, `keystone`, `wrapper`, `layer_3`, `quota`, `Temporal`, `fastapi` across all source |

Full tree (2026-06-10):

```
cloudstore-bl/
├── 3rdparty/python/            # testing resolve: pytest only — NO runtime deps yet
├── .cds/                       # CDS CI: verify (lint/check/test) + build-pants image
├── devops/pants/Containerfile  # bl-pants CI image (unchanged since May)
├── docs/internal/components.puml          # ← the architecture intent (see §3)
├── layer_2/services/
│   ├── nova_translator/        # stub: __main__.py with empty main() + design docs
│   └── producer/               # real code: event-sourced usage aggregate + tests
├── libs/
│   ├── common/                 # usage commands/events/values (Interval, Units)
│   ├── eventsourcing/          # Aggregate / Command / Event abstractions
│   ├── eventstore/             # EventStore iface + CSV + in-mem adapters
│   ├── message_bus/            # Publisher/Subscriber/MessageBus + pickle adapter
│   ├── usage_translator/       # docs only (class diagram) — no code
│   └── util/                   # empty placeholder (BUILD + __init__.py)
├── Makefile / pants.toml / pyproject.toml / README.md
```

README is **unchanged** (3 lines): *"holds all common stuff between Layer 2 **and Layer 3** repositories of the BusinessLogic squad"* — i.e. the README still talks about other repos that don't visibly exist, and there is **no `layer_3/` directory**.

---

## 2. `layer_2/services/` inventory

| Service | Purpose | Maturity | Entry point / Dockerfile / BUILD | CAIM-equivalent |
|---|---|---|---|---|
| **`producer`** | Consumption event producer: receives `TrackUsageCommand`s from the message bus, validates against the event-sourced `ProjectUsageAggregate` (per-project → per-instance → per-product unit counters, interval-overlap guard), appends `UsageTrackedEvent`s to the Event Store | **Real code, tested** (4 test files, CSV fixtures) — but **prototype-grade**: adapters are file-based (CSV event store, pickle message bus), no real transport (no Redis/Kafka), no API | No entry point, no Dockerfile, no Helm. Pants `python_sources()` only — **no `pex_binary`/`docker_image` target, i.e. nothing deployable** | **None.** Not an API drone, not a service drone — different domain (metering, not IDAM) |
| **`nova_translator`** | Intended: read Nova usage metrics (per design docs: from Prometheus via a `PrometheusClient`), translate to `TrackUsageCommand`s, publish to the bus. Siblings `cinder_translator` + `object_storage_translator` exist **only in PUML diagrams** | **Stub.** `__main__.py` is `def main(): pass` — and even guards on `if __name__ == "main"` (missing underscores → never runs). **No BUILD file** — Pants doesn't even build it | None / none / **missing BUILD** | **None** |
| *(diagram-only)* `agora_projector` | Per `docs/internal/components.puml`: builds projections from the Event Store and pushes to **Agora** (Edge/billing) | Does not exist in code | — | None |

**Architecture style:** event sourcing + CQRS-ish command/event split + ports-and-adapters (interfaces with CSV/pickle/in-mem fakes). Plain Python 3.12 classes. **Not** FastAPI, **not** the CAIM drone+Redis pattern, no Temporal.

### CAIM reuse-expectation check (per [`business-logic-iam.md`](business-logic-iam.md) §2.1)

| Expected CAIM component | Equivalent in `cloudstore-bl`? |
|---|---|
| `idam-api` drone | ❌ none |
| `requests-api` drone | ❌ none |
| `controller-drone` | ❌ none |
| service drones (organization / project / user) | ❌ none |
| `keycloak-wrapper-drone` | ❌ none |
| `region-wrapper-drone` | ❌ none |
| `object-storage-wrapper-drone` | ❌ none |
| CAIM-Redis | ❌ none (closest analogue: pickle-file message bus) |

**0 of 8 CAIM-style components exist in the monorepo.** Q-210 (secret store) and Q-211 (region-wrapper config) remain unanswerable from this repo.

---

## 3. Shared libs + build/CI

**`libs/`** — all usage-domain or generic plumbing, **no external-system clients at all** (no Keycloak/Keystone/IDAM client, no HTTP client, not even the `PrometheusClient` from the diagrams):

| Lib | Content |
|---|---|
| `libs/common` | `TrackUsageCommand` / `InitializeProjectUsageCommand`; `UsageTrackedEvent` / `ProjectUsageInitializedEvent` (carry `project_id`, `product_id`, `instance_id`, `region_id`); value objects `Interval` (overlap check) + `Units` (non-negative) |
| `libs/eventsourcing` | Minimal `Aggregate` / `Command[T: Event]` / `Event` ABCs (~80 LOC total) |
| `libs/eventstore` | `EventStore` interface + CSV-file and in-memory adapters, with replay |
| `libs/message_bus` | `Publisher`/`Subscriber`/`MessageBus` interfaces + `PickledMessageBus` (append-to-file, replay-on-consume) |
| `libs/usage_translator` | Class diagram only — `UsageTranslator` interface with Nova/Cinder/ObjectStorage adapter plan |
| `libs/util` | Empty placeholder |

**Build/CI** — unchanged from the May survey: Pants 2.31 / Python 3.12 / `bl-pants` Docker image / CDS workflows (`verify` = lint + mypy + test on every push/PR; `build-pants` rebuilds the tool image). Notable: **the only dependency resolve is `testing` (pytest ≥ 8.4)** — `python-default` is commented out with *"remove this as so we have real dependencies"*, i.e. the codebase has **zero runtime third-party dependencies** so far. No PyInstaller, no distroless packaging, no Helm, no deploy artefacts of any kind.

`docs/internal/components.puml` is the clearest statement of intent — an **SNC-framed** consumption pipeline:

```
SNC Layer 1                          SNC Layer 2 "Consumption"        Edge
  OpenStack: nova_usage_reporter ─┐
             cinder_usage_reporter ├─→ producer ─→ [Event Store] ←─ agora_projector ─→ agora
             (read from Prometheus)│
  ObjStore:  object_storage_usage_reporter ┘
```

L1 reporters and `agora_projector` are not in this repo (or anywhere we can see) — only `producer` is real.

---

## 4. What this means for Q-230 + M3 BL estimation

### Q-230 verdict (as far as this repo can answer)

Q-230's three options — (a) exist under different naming, (b) exist in a different stash project, (c) don't exist yet:

- **L2 — split verdict by domain:**
  - **Consumption/usage BL: option (a) holds, in a modified form.** The L2 services exist not as separate `*-drone` repos but **inside the `cloudstore-bl` monorepo** under `layer_2/services/`. They are real but **early prototypes** (file-based adapters, one stub, nothing deployable) — started 2026-05-13, i.e. *the same day the old survey concluded "build tooling only"*.
  - **IDAM/CAIM BL (the domain CLOUD-587/589/600/616 care about): option (c) holds for this repo.** Not one of the 8 expected CAIM-style components exists here, and nothing in the code, BUILD targets, CI, or docs points at them. If the CAIM stack is to be *reused*, the artefacts (Helm chart, images) must come from the SNC/CAIM side — they are not being rebuilt in `cloudstore-bl`. Whether they exist in another stash project (option (b), e.g. CLOUD) is **still unverified from code** — that's the remaining ask to Martin (BL lead).
- **L3 — unresolved (option b or c).** No `layer_3/` directory, zero `layer_3`/`L3` grep hits; the README's promise of "Layer 3 repositories" remains unbacked by anything visible in the CLOUDSTORE project.

### Impact on M3 BL estimation (CLOUD-587 / CLOUD-589 / CLOUD-600 / CLOUD-616)

1. **The BL squad's current sprint capacity is going into consumption metering (SOV-345 lineage), not IAM/BL.** Two engineers, four weeks, and the output is the usage pipeline — nobody is visibly standing up the CAIM stack for OPCP-CloudStore.
2. **CLOUD-587 ("deploy CAIM stack") cannot be a pure deploy job sourced from this repo.** Either the SNC CAIM Helm chart/images are pulled from SNC's own repos (then M3 sizing = deploy + adapt, as `business-logic-iam.md` §4 assumed — but we still haven't located those artefacts), or the BL squad intends to build OPCP-side BL natively in this monorepo — in which case the IDAM services are **net-new from zero** and the 8-week CLOUD-587 estimate is optimistic.
3. **Architecture-style signal:** the monorepo's new code follows event-sourcing/ports-and-adapters, *not* CAIM's drone+Redis pattern. If this is the squad's house style going forward, a "CAIM reuse" plan that assumes drop-in drones needs explicit confirmation — the squad may be planning a rewrite, not a redeploy.
4. **Q-210 (secret store) and Q-211 (region-wrapper config) stay blocked** — still no Helm values, no runtime config anywhere in the repo.
5. **One genuinely useful M3 asset:** the consumption pipeline (`producer` + planned translators + `agora_projector`) is plausibly the substrate for CB usage/billing reporting (`UsageTrackedEvent` already carries `instance_id` + `region_id`, which matches VM-per-region metering). If CB M3 has a consumption/reporting line item, it should be sized against *this* code rather than assumed absent.

### Contradiction with the old survey worth noting

The 2026-05-13 survey's "circumstantial evidence" reading (§3, Q-228 aside) inferred a *"one repo per deliverable"* culture from `cloudstore-bl`. Reality is the opposite: **the BL squad consolidated into a monorepo.** Don't carry that inference forward into the SOV-680/vendoring reasoning.

---

## 5. New open questions raised (list only — not yet filed as Q-rows)

1. Is the BL squad's plan for OPCP-CloudStore IAM/BL **(i) deploy SNC CAIM artefacts** (where are chart + images?), **(ii) rewrite IDAM services natively in this monorepo** (event-sourcing style), or **(iii) something else**? Directly gates CLOUD-587 sizing. → ask Martin (BL lead).
2. Where do **`layer_3` services** live, if anywhere — different stash project (CLOUD?), or not started? (Refines Q-230's residual.)
3. Is the **consumption pipeline** (`producer`/translators/`agora_projector` → Agora) in scope for CB M3 reporting, and does CB metering plug into `nova_usage_reporter` → `producer` as `components.puml` sketches?
4. What is the intended **production transport + persistence** for the bus/event store (the CSV/pickle adapters are clearly placeholders — Redis? Kafka? Postgres?) — affects what CloudStore must host for BL.
5. Who are **Sebastian Windau + Lukas Langen** organisationally (Martin's BL squad?), and is consumption their only current stream? Affects who we book M3 IAM/BL capacity against.

---

## 6. Cross-links

- **Q-230** (and refined Q-210 / Q-211): [`open-questions.md`](../open-questions.md)
- **Superseded survey (2026-05-13):** [`cloudstore-bl-survey.md`](cloudstore-bl-survey.md) — keep for the build-infra detail + the original Q-210/Q-211 framing
- **CAIM reuse map:** [`business-logic-iam.md`](business-logic-iam.md) (§2.1 component list this survey checked against; §4 reuse table now needs the option-(i)/(ii) caveat from §4 above)
- **Deep dive:** [`Business Logic & IAM Deep Dive`](../../../architecture/conceptions/business-logic-iam/summary.md)
- **Repo inventory:** [`EXTERNAL-REPOS.md`](../../../../../_workspace/EXTERNAL-REPOS.md) — `cloudstore-bl` entry should be updated from "build tooling only" to "BL monorepo, L2 consumption services in progress"
- **Source:** `ssh://git@stash.ovh.net:7999/cloudstore/cloudstore-bl.git` @ `44b8ab9` (2026-06-09, "Make CSVProjectUsageHandler instances callable"); clone was temporary (`/tmp/bl-survey`, deleted after survey)

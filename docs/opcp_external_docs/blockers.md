# Object Storage — Live Blockers

> Updated daily once the project is active. Each row: what · since · owner · ETA · escalation · gates.
>
> **Last updated:** 2026-06-02.

## 🔴 Active

| Blocker | Since | Owner | ETA | Escalation | Gates |
|---|---|---|---|---|---|
| ~~**Rook POC** (OSQ-15)~~ ✅ **moot 2026-06-09** — OSQ-15 closed: **CephADM + Ansible, no Rook**. The K3S bring-up work (Boris + Zafar) continues for the service control plane, but it is no longer a "Rook POC". | 2026-05-27 | Boris Behrens (Zafar to support) | — | — | M1 provisioning engine (SOV-855) |
| **RGW admin credentials flow** (OSQ-17) *(reframed 2026-06-09: OSQ-15 closed — CephADM + Ansible, no Rook; the "if Rook wins" branch is moot — resolve under the CephADM model)* | 2026-05-27 | Ibrahim / Boris | TBD | — | RGW ↔ Keystone wiring (SOV-854, SOV-856) |
| **RGW federation against Keycloak** (OSQ-02 remaining) | 2026-06-02 | Ibrahim Takouna | TBD — pending design work | Flagged in alignment meeting 2026-06-02 | RGW→Keycloak wiring (SOV-856, SOV-865) |
| **Business Logic capacity** (OSQ-03) | 2026-05-18 | BL squad (Vincent / Ibrahim) | BL full until June for SNC | Surfaced | Account activation, quota, usage — M2 date |

## 🟡 Watch

| Item | Note |
|---|---|
| **Missing design inputs** | GSSNC-411 HLD is an empty stub; SNC Object-Storage Product Note + KB0065306 not yet in hand. Blocks architecture proposal. |

## ✅ Resolved

- ~~**Provisioning boundary (OSQ-01)**~~ → ✅ 2026-05-27 (Marc D): VCF way confirmed — Package calls OpenStack API directly, not via OPCP Infra API. **ADR:** [`decisions.md` 2026-05-27](../decisions.md). *(This file had the attribution right; the project CLAUDE.md said OSQ-15 — corrected 2026-08-25.)*
- ~~**OSQ-02 IAM chain**~~ → ✅ partially (Ibrahim 2026-05-27): Keystone Controller compatible; 6 RGW params known; RGW user created at service-enable time. Secrets handling open (OSQ-17).
- ~~**Stephan Hohn bandwidth**~~ → ✅ 2026-05-29: Stephan leaving OS workstream. Boris Behrens takes over.
- ~~**Infra environment error**~~ → ✅ 2026-05-29: Fixed after Zafar's onboarding session.

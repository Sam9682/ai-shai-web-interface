# Jira `SOV-855` — `[MS1][Provisioning Engine] Development`

> Parent: `LVL2-18375`. User-story Epic: `SOV-849`.
> **Blocked by `SOV-864` (OSQ-15) — architecture decision pending.**

## Scope

BM node provisioning for the Ceph cluster:
* Neutron: networking setup for the BM pool
* Nova bare-metal flavor → Ironic: BM → Ceph host
* Golden-image injection (Debian CIS-hardened, matching SNC baseline)
* Day-2 lifecycle: scale-in (drain + remove), scale-out (add node), node replace/heal

**VCF way confirmed (Marc D, 2026-05-27):** Package calls OpenStack API directly — NOT via the OPCP Infra API. CB uses the Infra API because Compute + Block need special OpenStack + network privileges; OS does not have that constraint.

## Architecture options (OSQ-15)

| Option | Summary | Status |
|---|---|---|
| **A — Pure TF + thin worker** | TF drives Ironic/Neutron; custom reconciler for day-2. TF's weak spot for drift/heal. | Not preferred |
| **B — Reuse OPCP Infra Operator** | Deploy the Storage Controller inside the Package. Couples to operator releases. | Possible |
| **C — Rook + VCF** | Package calls OpenStack/Ironic for BM provisioning; Rook manages Ceph day-2 inside `oss-cp` (k8s-native). Solves OSQ-17 naturally via k8s Secrets. | **Emerging direction** |

Next step: Boris Behrens leads the Rook discovery (Stephan left this workstream 2026-05-29). Zafar Akhtar to support with Kubernetes. Starting with Hello World OpenStack connectivity test. 3 `ceph-block-*` VMs in `paas-storage-block` available for the POC.

## Dependencies

* `SOV-864` OSQ-15 decision (blocks this Epic)
* `SOV-854` Ceph + RGW (bring-up tooling depends on engine choice)

## Links

* OSQ-15 analysis: [`open-questions.md`](../open-questions.md#osq-15--operator-reuse-analysis)

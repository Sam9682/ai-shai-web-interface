# Cloud Store GA criteria

> **🧭 VISION — Product idea (Product Management), NOT implementation status.** Mirror of the Confluence page [pageId 966951314](https://confluence.ovhcloud.tools/pages/viewpage.action?pageId=966951314) (v21, last modified 2026-07-08; re-synced 2026-07-15). Source = Confluence; on drift, Confluence wins. Use: planning/doc context for projects + runbooks.

---

## Related

## Acceptance matrix

NB: contrary to the OVH standard, the functional scope may evolve between Beta and GA (e.g, Beta 1, Beta 2, ...), as long as at least one Beta is issued before the GA without functional scope validation

Legend

| status | meaning |
| --- | --- |
| X | required, not done |
| partial | partial implementation |
| done | fully done |

|  |  | Preview | | | GA (Prod-ready) | | | Comment |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Category | Feature | Alpha | Beta 1 ... | ... Beta N | Managed Service | AirGap | SNC |  |
| Cloud Store | Install | done  (Bare Metal) | X  (VM) |  | X | X | X |  |
| Security proxies |  |  |  |  |  | X |  |
| Scalable/HA deployment |  |  |  | X  (at least Keycloack must be fault-tolerant so that login still works) | X  (at least Keycloack must be fault-tolerant so that login still works) |  |  |
| SNC-compliant Control Plane hardening |  |  |  |  |  | X |  |
| Update without data loss |  | X |  | X | X |  |  |
| Backup / Restore |  | X |  | X | X |  |  |
| Super-admin documentation, procedures & troubleshooting |  |  |  | X | X |  |  |
| Validated rewording & design |  | X |  | X | X |  |  |
| Control Plane logs in OPCP Core |  | X |  | X | X |  |  |
| Control Plane metrics in OPCP Core |  |  |  | X | X |  |  |
| Control Plane alerts in OPCP Core |  |  |  | X | X |  |  |
| In-product API documentation |  |  |  | X | X |  |  |
| Cloud Store services | Deploy w/ tenant and IAM integration | done | X |  | X | X |  |  |
| De-commission |  |  |  | X | X |  |  |
| Upscale |  | done |  | X | X |  |  |
| Downscale |  |  |  | X | X |  |  |
| Deploy service update without data loss |  | X |  | X | X |  |  |
| Landing Zone Manager | done | X |  | X | X |  |  |
| Backup / Restore |  |  |  | X | X |  |  |
| Logs and metrics forwarding |  |  |  | X | X |  |  |
| Logs and metrics stack |  |  |  | X (bonus: Control/Data plane separation) |  |  |  |
| Public Packager documentation |  | partial |  | X | X |  | 09/06/26: it's done but not public |
| Deploy on Bare Metal | done | X |  | X | X |  |  |
| Deploy on VM (= VM-based third party services) |  |  |  |  | ? |  |  |
| Openstack-based service | Reference Openstack Compute & Block setup | X |  |  |  |  |  |  |
| Network Services (= public connectivity) |  |  |  | X | X |  |  |
| Standalone service | Reference Ceph S3 4-node setup | X | X |  | X | X |  |  |
| Security Proxies |  |  |  |  |  | X |  |
| Landing Zone Manager | Projects |  |  |  | X | X |  | 09/06/26: project is a prerequisite of VM and will land much sooner than GA |
| User groups |  |  |  | X | X |  |  |
| Multi-language | done  (EN) | EN |  | EU | EU |  |  |
| In-product API documentation |  | X |  | X | X |  |  |
| Non-technical | Updated Website (web menu, product page, public prices, screenshots...) |  |  |  | X | X |  |  |
| Control Panel (Download area) |  |  |  | X | X |  |  |
| AGPL non-contamination guarantees ([in-product SBOM](https://confluence.ovhcloud.tools/display/CPO/OPCP+-+SBOM+and+Licence+Notice+Page), related documentation) |  |  |  | X | X |  |  |
| T&Cs |  |  |  | X | X |  |  |
| Managed Service T&Cs & SLOs |  |  |  | X |  |  |  |
| Security documentation (Software lifecycle, policy, SBOM...) |  |  |  | X | X |  |  |
| [Product Note](https://confluence.ovhcloud.tools/display/CPO/OPCP+Product+Development+Process#OPCPProductDevelopmentProcess-Deliverables) | X |  |  |  |  |  |  |
| [Technical Specifications / ADR](https://confluence.ovhcloud.tools/display/CPO/OPCP+Product+Development+Process#OPCPProductDevelopmentProcess-Deliverables) | X |  |  |  |  |  |  |
| [Feature Design Document](https://confluence.ovhcloud.tools/display/CPO/OPCP+Product+Development+Process#OPCPProductDevelopmentProcess-Deliverables) |  | X |  |  |  |  |  |
| User documentation | partial | X |  | X | X |  |  |
| Commercial documentation (datasheet, final business model, pricelist, ...) |  |  |  | X | X |  |  |
| Billing process and Product metrics tracking |  |  |  | X | X |  |  |
| Support process in place |  |  |  | X | X |  |  |
| Training program by professional services exists |  |  |  | X | X |  |  |


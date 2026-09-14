# OPCP Core - ISO support

> **🧭 VISION — Product idea (Product Management), NOT implementation status.** Mirror of the Confluence page [pageId 918874241](https://confluence.ovhcloud.tools/pages/viewpage.action?pageId=918874241) (v3, last modified 2026-06-24; re-synced 2026-07-15). Source = Confluence; on drift, Confluence wins. Use: planning/doc context for projects + runbooks.

---

|  |  |
| --- | --- |
| **Status** | Won't do (not fixing anything) |
| **Owner** | Florent Thiery |

## Context

Currently [we only support qcow images for bare metal provisioning](https://help.ovhcloud.com/csm/en-ie-opcp-create-image?id=kb_article_view&sysparm_article=KB0073667).

## The problem we are trying to fix

 the problem is that most software vendors (VMware, Nutanix, RedHat etc) do not offer qcow images but ISO-based installers, which makes it much harder for customers to deploy their preferred virtualization platforms on OPCP Core, and forces us to negociate support with the editor (typically, Nutanix).

Could ISO support improve native compatibility with third party platforms in a generic way ?

## Workaround

We are working around the lack of ISO support in OPCP Core by resorting to a double disk process, where the ISO is burnt onto one of the disks, then the server is rebooted onto it and finally the installation ISO is launched.

Open question: what is wrong with this method ?


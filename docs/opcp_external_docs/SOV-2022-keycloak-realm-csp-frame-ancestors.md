---
id: object-storage-on-cloud-store/jira-sov-2022-keycloak-realm-csp-frame-ancestors
type: jira
diataxis: reference
title: "SOV-2022 — [MS2][OS] Keycloak realm CSP: frame-ancestors must allow the CloudStore UI"
owner: sov-copilot
status: draft
publish_target: git
product: cloudstore
---

# Jira [`SOV-2022`](SOV-2022) — `[MS2][OS] Keycloak realm CSP — frame-ancestors must allow the CloudStore UI to frame the panel login`

> **Type:** Task · **Status:** Backlog · **Created:** 2026-07-29 · **Assignee:** Unassigned.
> **Epic Link:** [`SOV-850`](SOV-850) `[MS2][OS] Activate Object Storage for a
> Customer` *(matching the `SOV-1530` / `SOV-1531` pattern of OS-wide M2 tasks linked to the user-story Epic)*.
> **Outer parent:** `LVL2-18375`.

---

## ⚠️ Ownership — read first

**This is really a CloudStore API team task** — they create the Keycloak realm when a new account is
provisioned. It's tracked on our side because it **blocks the Object Storage panel**, not because OS owns the
fix.

**We could implement it ourselves and raise a PR — but sync with the CloudStore API team / Pierre-Yves Aillet
BEFORE writing any code.** That sync is **step 1**, not an afterthought. No PR against their repo without it.

## What needs to change

When CloudStore creates a Keycloak realm for a new account, set **Realm Settings → Security Defenses →
Content-Security-Policy** to:

```
frame-src 'self'; frame-ancestors 'self' https://*.staging.cloudstore.ovh; object-src 'none';
```

**The load-bearing part is `frame-ancestors`.** Keycloak defaults it to `'self'` — only Keycloak's own origin
may frame it. It must additionally include the **wildcarded base URL of the CloudStore UIs**
(`https://*.staging.cloudstore.ovh` for staging).

> **📌 This is a minimal delta, not a rewrite.** Keycloak's default for this setting is
> `frame-src 'self'; frame-ancestors 'self'; object-src 'none';` — the proposed value is that default **plus one
> origin** on `frame-ancestors`. `frame-src` and `object-src` are untouched, so nothing else is weakened. Worth
> saying out loud in the review, because it makes the ask easy to approve.

## Why it's needed

The OS panel is delivered as an **iframe** — the dataplane declares `Panel: format: "iframe"` in
`cloudstore.yaml` and outputs `https://<panel_fqdn>/standalone/objectstorage`, which the CloudStore UI embeds.

When the panel triggers an OIDC login, **Keycloak loads inside that iframe**. `frame-ancestors` is evaluated
against the **entire ancestor chain**, whose top-level ancestor is the CloudStore UI origin. With the default
`'self'`, the browser refuses to render Keycloak and **the login flow inside the panel breaks**.

**It cannot be worked around on our side.** The header comes from Keycloak, and neither the package nor the
panel's nginx sets any CSP or `X-Frame-Options` — verified 2026-07-29 against `origin/main` @ `0.2.0-alpha.18`
and the `regional-manager` nginx config (both have zero CSP handling).

## Design points to raise in the sync

| # | Point |
|---|---|
| **1** | **The value is environment-specific.** `staging.cloudstore.ovh` is staging; prod and dev differ. Realm creation must **parameterise per environment**, not hardcode staging — same class of concern as the `domain` / `environment` inputs in [`SOV-2019`](SOV-2019-input-variable-cleanup.md). |
| **2** | **Confirm the wildcard covers the panel FQDN depth.** `frame-ancestors` validates the whole ancestor chain, so both the CloudStore UI origin *and* the panel origin are involved. The panel FQDN is a multi-label subdomain under the service domain — **verify in a browser** that one `*.` wildcard matches it rather than assuming; CSP host-source wildcard behaviour across subdomain levels is worth testing, not reasoning about. |
| **3** | **Per-realm or a realm-template default?** If every CloudStore service shipping an iframe panel needs this, setting it once in the realm template beats per-service requests. **OS is unlikely to be the only iframe consumer.** |
| **4** | **Who else already needs this?** Another service may have hit it already — check for an existing fix or ticket on the CloudStore API side before duplicating. |

## Definition of Done

1. Sync with the CloudStore API team / Pierre-Yves Aillet has happened and the outcome is recorded — either
   they take it, or we implement and raise a PR **with their agreement**.
2. Realm creation sets the CSP with the CloudStore UI origin present in `frame-ancestors`.
3. The value is **derived per environment**, not hardcoded to staging.
4. **Verified end to end:** a freshly provisioned account's panel completes an OIDC login **inside the iframe**
   in a real browser, with no CSP violation in the console.
5. Confirmed whether this belongs in a **realm template** so other iframe-based services inherit it.

## Links

- Epic: [`SOV-850`](SOV-850) `[MS2][OS] Activate Object Storage for a Customer` ·
  mirror [`SOV-850-ms2-activate-customer.md`](SOV-850-ms2-activate-customer.md)
- **CloudStore API contact:** Pierre-Yves Aillet — also owns `SOV-1260` / `SOV-1268` platform-side, and was in
  the [2026-06-02 Controllers & Secrets Alignment](../meetings/2026-06-02-controllers-secrets-alignment.md)
  (shared the OIDC variables documentation with Ibrahim)
- Related: [`SOV-2019`](SOV-2019-input-variable-cleanup.md) *(same per-environment parameterisation concern)* ·
  [`SOV-2021`](SOV-2021) / OSQ-35 *(the panel iframe is
  also a browser-trust surface for the private-CA leaf)* ·
  [`SOV-2020`](SOV-2020) / OSQ-30 *(the panel's
  cross-origin calls to S3 are why the generic CORS layer exists)*
- Package evidence: `cloudstore.yaml` dataplane output `Panel: format: "iframe"` ·
  `terraform/dataplane/outputs.tf` panel URL · `terraform/dataplane/modules/panel/`

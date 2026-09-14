---
id: object-storage-on-cloud-store/jira-sov-2525-keystone-error-passthrough
type: jira
diataxis: reference
title: "SOV-2525 — [MS2][S3 Credential Middleware] Forward Keystone errors to the caller instead of a generic 500"
owner: sov-copilot
status: approved
publish_target: git
product: cloudstore
---

# Jira [`SOV-2525`](SOV-2525) — `[MS2][S3 Credential Middleware] Forward Keystone errors to the caller instead of a generic 500, naming the failed operation and a remediation hint`

> **Type:** Task · **Status:** ✅ **Done** · **Created:** 2026-09-04 · **Reporter + Assignee:** **Jan Stuhlmann**.
> **Epic Link:** [`SOV-857`](SOV-857-ms2-s3-credential-middleware.md) `[MS2][S3 Credential Middleware] Development`.
> **Outer parent:** `LVL2-18375`.
> **Filed after the fact** — the change was already committed + pushed, so the ticket landed as Done.

---

## What changed

The [objectstorage-middleware](../architecture/objectstorage-middleware.md) used to answer *every* Keystone failure
with an opaque `500`. It now forwards Keystone's own status code and message, and every error payload names the
Keystone **operation** that failed — plus a concrete remediation hint when Keystone itself supplies no usable message.

**Before:** a federation 401, a credential-policy 403, a missing-IdP 404 — all reached the end user as
`500 Internal Server Error`, with nothing to act on. Exactly one narrow case was already forwarded (commit
`ff215f6`, 2026-07-28: a Keystone 404 on the credential routes). Everything else was masked.

**Now:**

1. Keystone 4xx is forwarded verbatim — same status code, Keystone's own message.
2. Keystone 5xx becomes **502** — the fault is upstream of the middleware, not in it.
3. Every error payload carries an `operation` field naming the Keystone interaction that failed.
4. When Keystone's body has no usable message (empty body, or an HTML error page from the `mod_auth_openidc`
   adapter in front of Keystone), the middleware **synthesises** one from the failed operation + a status-specific
   hint on how to resolve it.

Example — federation exchange rejected by the OIDC adapter:

```json
{
  "statusCode": 401,
  "error": "Unauthorized",
  "message": "Keystone returned 401 while exchanging your identity token for a Keystone token. The OIDC adapter (mod_auth_openidc) in front of Keystone may not trust this Keycloak realm, or the token audience may not match the client it expects.",
  "operation": "federation-exchange"
}
```

## Operations the payload can name

| `operation` | Reads as *"Keystone returned NNN while …"* |
|---|---|
| `federation-exchange` | exchanging your identity token for a Keystone token |
| `project-discovery` | looking up the Keystone project your account maps to |
| `token-rescope` | scoping your Keystone token to a project |
| `service-token` | authenticating the middleware service account with Keystone |
| `credential-create` | creating the credential in Keystone |
| `credential-list` | listing your credentials in Keystone |
| `credential-list-all` | listing all credentials in Keystone |
| `credential-delete` | deleting the credential in Keystone |

Each carries per-status hints. Two examples: a 403 on `credential-create` points at the Keystone policy for
`identity:create_credential` and at the service-account write mode; a 404 on `token-rescope` points at the
configured project id.

## Status mapping

| Keystone answered | Caller now gets |
|---|---|
| 400 · 401 · 403 · 404 · 409 · 413 · 429 | the same status, forwarded |
| 5xx, or unreachable | `502 Bad Gateway` |
| a fault inside the middleware | `500`, as before |

## API contract

Every credential route now declares 400 / 401 / 403 / 404 / 409 / 500 / 502 in its response schema
(`CommonErrorResponses` in `src/schemas.ts`), so the generated OpenAPI document matches what a caller can actually
receive. `operation` is **optional** on the error schema — present only for upstream Keystone failures, absent for
the middleware's own errors.

## Where the code is

```
repo    ssh://git@stash.ovh.net:7999/cloudstore/objectstorage-middleware.git
commit  440cfd6 on main, 2026-09-04, pushed
        feat: pass-thru keystone 40x errors and on error case always display
        to the end user which operation failed and try to include a possible solution

new     src/keystone/errors.ts   operation catalogue, hints, status mapping
touched src/credentials/routes.ts, src/credentials/service.ts, src/schemas.ts,
        src/keystone/{http,federation,serviceToken,credentials}.ts
tests   test/keystoneErrors.test.ts (new), test/routes.test.ts, test/service.test.ts

predecessor  ff215f6, 2026-07-28 — forwarded only the OIDC-adapter 404; this generalises it
```

## Cross-references

- [Object Storage Middleware deep-dive](../architecture/objectstorage-middleware.md) — what the middleware is, and the *as built* delta vs ADR 0045.
- [`SOV-857`](SOV-857-ms2-s3-credential-middleware.md) — the MS2 work-block Epic this sits under.
- [Jira structure index](README.md) · [Object Storage overview](../overview.md)

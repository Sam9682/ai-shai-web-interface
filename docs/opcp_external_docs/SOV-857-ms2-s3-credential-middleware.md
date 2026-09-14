# Jira `SOV-857` — `[MS2][S3 Credential Middleware] Development`

> Parent: `LVL2-18375`. User-story Epic: `SOV-850`.

## Scope

Deploy and integrate the **SOV-514 S3 credential middleware** (ADR-0045) on top of the in-package Keystone:
* Issues **temporary** (STS-style) and **permanent** EC2/S3 keypairs scoped per customer account
* Credential secret is shown **once only** — never re-exposed after initial creation
* Reuses the SNC implementation directly — scope here is integration + packaging inside the OS Package

## What SOV-514 does (for context)

SOV-514 is the existing SNC S3 credential proxy that sits in front of RGW's EC2 Auth endpoint. It intercepts key-creation requests, generates the keypair, stores the secret hash (never the plaintext), and returns the secret once to the caller. This is the mechanism that enforces "secret shown once" compliance.

## Dependencies

* `SOV-856` Dedicated Keystone must be live before this can be integrated
* SOV-514 codebase — Storage team consumes it; not developed here

## Links

* ADR-0045: [`products/cloudstore/misc/compute-block-on-cloud-store/plans/snc-adr-alignment-2026-05-19.md`](../../compute-block-on-cloud-store/plans/snc-adr-alignment-2026-05-19.md)
* SOV-514: [`SOV-514`](SOV-514)

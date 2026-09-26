# Implementation Plan: Per-Instance Database Name

## Overview

This is a configuration-only change scoped entirely to `docker-compose.yml`. The plan replaces the four static `shai_db` references with the inline-interpolated value `shai_db${HTTP_PORT:-6000}`, adds a per-instance physical name to the PostgreSQL data volume, and verifies the result with rendered-configuration checks (`docker compose config`). Because this is an Infrastructure-as-Code / config change, property-based testing is not applicable; verification uses the rendered-config approach from the design's Testing Strategy.

## Tasks

- [ ] 1. Derive the database name from HTTP_PORT at all four usage sites in `docker-compose.yml`
  - [ ] 1.1 Update the App_Service `DATABASE_URL`
    - In the `ai-shai-web-interface` service `environment`, change the database path segment so `DATABASE_URL` becomes `postgresql://shai_user:${POSTGRES_PASSWORD:-shai_password}@postgres:5432/shai_db${HTTP_PORT:-6000}`
    - Preserve the existing user `shai_user`, password source `${POSTGRES_PASSWORD:-shai_password}`, host `postgres`, and port `5432` exactly
    - _Requirements: 1.1, 1.2, 2.1, 2.2, 2.3_

  - [ ] 1.2 Update the Postgres_Service `POSTGRES_DB`
    - In the `postgres` service `environment`, set `POSTGRES_DB: shai_db${HTTP_PORT:-6000}`
    - _Requirements: 1.1, 1.2, 3.1, 3.2, 3.3_

  - [ ] 1.3 Update the Postgres_Service healthcheck target database
    - In the `postgres` service `healthcheck.test` (`CMD-SHELL`), change the `-d` argument so the command reads `pg_isready -U shai_user -d shai_db${HTTP_PORT:-6000}`
    - Preserve the existing `-U shai_user` argument
    - _Requirements: 1.1, 1.2, 4.1, 4.2, 4.3_

  - [ ] 1.4 Update the Ingest_Service `PG_DB`
    - In the `ingest` service `environment`, set `PG_DB=shai_db${HTTP_PORT:-6000}`
    - Preserve the existing host (`postgres`), user (`shai_user`), and password source (`${POSTGRES_PASSWORD:-shai_password}`)
    - _Requirements: 1.1, 1.2, 5.1, 5.2, 5.3_

- [ ] 2. Add the per-instance PostgreSQL data volume name
  - [ ] 2.1 Set the physical volume name and keep the service mount on the alias
    - Under the top-level `volumes:` block, set `postgres_data.name: shai-postgres-data-${HTTP_PORT:-6000}` while keeping `postgres_data` as the alias key
    - Confirm the `postgres` service still mounts the `postgres_data` alias at `/var/lib/postgresql/data` (leave the mount line referencing `postgres_data` unchanged)
    - Leave `app_data` unchanged (out of scope)
    - _Requirements: 6.1, 6.2, 6.3, 6.4_

- [ ] 3. Verify the rendered configuration
  - [ ] 3.1 Verify the default-port render
    - Run `docker compose config` with no `HTTP_PORT` set
    - Assert all four database-name sites resolve to `shai_db6000` and the volume `name` resolves to `shai-postgres-data-6000`
    - Assert the four database-name occurrences are byte-for-byte equal (consistency check)
    - Assert `DATABASE_URL` still contains `shai_user`, `@postgres:5432/`, and the `POSTGRES_PASSWORD` reference (preserved-attributes check)
    - _Requirements: 1.2, 2.2, 2.3, 3.3, 4.3, 5.2, 5.3, 6.4, 7.1_

  - [ ] 3.2 Verify the explicit-port render
    - Run `docker compose config` with `HTTP_PORT=6100`
    - Assert all four database-name sites resolve to `shai_db6100` and the volume `name` resolves to `shai-postgres-data-6100`
    - Assert the four database-name occurrences are byte-for-byte equal (consistency check)
    - _Requirements: 1.1, 1.3, 6.1, 6.2, 7.1, 7.2_

- [ ] 4. Final checkpoint
  - Ensure both rendered-config checks pass, ask the user if questions arise.

## Notes

- This is a configuration-only change confined to `docker-compose.yml`; no application source code, migrations, or Dockerfiles are modified.
- Property-based testing is not applicable for this IaC/config change (per the design's Correctness Properties and Testing Strategy). Verification uses rendered-configuration checks (`docker compose config`) that require no running containers.
- Each task references specific requirements for traceability.
- The verification tasks in section 3 map to the design's Property 1 (consistent name across four sites), Property 2 (distinct per-instance volume), and Property 3 (preserved connection attributes).

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2"] },
    { "id": 2, "tasks": ["1.3"] },
    { "id": 3, "tasks": ["1.4"] },
    { "id": 4, "tasks": ["2.1"] },
    { "id": 5, "tasks": ["3.1"] },
    { "id": 6, "tasks": ["3.2"] }
  ]
}
```

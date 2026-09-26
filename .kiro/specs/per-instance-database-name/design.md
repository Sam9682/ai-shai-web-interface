# Design Document

## Overview

This feature makes each Compose instance own a separate PostgreSQL database by deriving the database name from `HTTP_PORT`, and gives each instance its own data volume so the isolation is real rather than cosmetic. The change is **configuration-only, scoped entirely to `docker-compose.yml`**. No application source code, migration scripts, or Dockerfiles are modified.

The core idea is to replace the four static references to `shai_db` with the inline-interpolated value `shai_db${HTTP_PORT:-6000}`, and to attach a per-instance physical name to the PostgreSQL data volume. Docker Compose interpolates `${...}` expressions in the YAML at parse time (before any container runs), so the same computed name resolves identically at every usage site.

### Goals

- Every reference to the database name within one instance resolves to the same `Instance_Database_Name` (`shai_db<HTTP_PORT>`, default `shai_db6000`).
- Two instances started with different `HTTP_PORT` values get distinct databases stored in distinct volumes.
- The change is minimal, reversible, and confined to `docker-compose.yml`.

### Non-Goals

- No changes to application code, ORM configuration, or Alembic migrations.
- No renaming of the Compose service names or container-name scheme.
- No automatic migration of data from a pre-existing shared `shai_db` database.

## Architecture

The change is scoped entirely to `docker-compose.yml`. At a high level, the architecture is a **parse-time string-substitution pipeline**: Docker Compose reads the compose file, resolves every `${...}` expression before any container starts, and hands the fully-resolved configuration to the container runtime. There is no runtime logic in the project's own code involved in deriving the name.

The flow of the derived `Instance_Database_Name` through the compose file:

```
                         HTTP_PORT (env, default 6000)
                                   │
                    ┌──────────────┴───────────────┐
                    ▼                               ▼
        shai_db${HTTP_PORT:-6000}      shai-postgres-data-${HTTP_PORT:-6000}
        (Instance_Database_Name)         (Postgres_Data_Volume name)
                    │                               │
     ┌───────┬──────┴──────┬─────────┐             ▼
     ▼       ▼             ▼         ▼      volumes.postgres_data.name
 DATABASE  POSTGRES_DB  healthcheck  PG_DB   (physical Docker volume)
   _URL    (postgres)   -d (postgres)(ingest)
 (app)
```

Compose interpolates `${...}` expressions in the YAML at parse time (before any container runs), so the same computed name resolves identically at every usage site. Because every site reads `HTTP_PORT` directly (the value is inlined rather than stored in an intermediate variable), all four database-name sites and the volume name always stay in sync with `HTTP_PORT`.

The following subsections describe how the name is derived and why inline interpolation is reliable at each usage site.

### Variable-Derivation Strategy

Docker Compose does **not** support nested interpolation such as `${SHAI_DB:-shai_db${HTTP_PORT}}` inside a single expression — a `${...}` block cannot contain another `${...}`. The clean, supported approach is **direct concatenation of a literal prefix with a single simple interpolation**:

```
shai_db${HTTP_PORT:-6000}
```

This is a literal string (`shai_db`) immediately followed by one `${HTTP_PORT:-6000}` expression. Compose resolves it as follows:

- If `HTTP_PORT` is set (for example `6100`), the value becomes `shai_db6100`.
- If `HTTP_PORT` is unset or empty, the `:-6000` default applies and the value becomes `shai_db6000`.

This satisfies Requirement 1 (concatenation of `shai_db` + `HTTP_PORT`), including the default behavior in AC 1.2.

**Where the value is formed:** The value is formed **inline at each of the four usage sites** (no new intermediate `.env` variable is introduced). Inlining keeps all four sites self-describing, avoids adding a variable that could drift out of sync with `HTTP_PORT`, and guarantees that AC 7.2 (recompute from `HTTP_PORT` on change) holds automatically — because every site reads `HTTP_PORT` directly. The same expression `shai_db${HTTP_PORT:-6000}` is used verbatim at all four sites.

### Why inline interpolation works at each site

Compose performs variable substitution on the compose file during parsing, before it hands the resolved values to the containers. This means:

- **`environment` values** (both list-form `- KEY=value` and map-form `KEY: value`) support `${...}` interpolation directly. So `DATABASE_URL`, `POSTGRES_DB`, and `PG_DB` can embed `shai_db${HTTP_PORT:-6000}`.
- **`healthcheck.test` with `CMD-SHELL`**: the command string is part of the YAML, so Compose interpolates `${HTTP_PORT:-6000}` at parse time. The container receives the already-substituted string `pg_isready -U shai_user -d shai_db6000` (for the default). No shell-level environment expansion inside the container is required, which is why `CMD-SHELL` is correct and reliable here. (Using `CMD` array form would also work, but `CMD-SHELL` is already in use and is retained.)

## Components and Interfaces

The "components" of this configuration change are the four database-name usage sites plus the volume `name:` property. Each is an interface point where the derived `Instance_Database_Name` (or `Postgres_Data_Volume` name) is consumed. Together they form the complete surface area of the change.

### Per-Usage-Site Changes

All four sites must resolve to the same `Instance_Database_Name`. The table below lists the exact current value and the exact new value.

| # | Site | Location in `docker-compose.yml` | Current value | New value |
|---|------|----------------------------------|---------------|-----------|
| 1 | App `DATABASE_URL` | `ai-shai-web-interface` service → `environment` | `postgresql://shai_user:${POSTGRES_PASSWORD:-shai_password}@postgres:5432/shai_db` | `postgresql://shai_user:${POSTGRES_PASSWORD:-shai_password}@postgres:5432/shai_db${HTTP_PORT:-6000}` |
| 2 | Postgres `POSTGRES_DB` | `postgres` service → `environment` | `POSTGRES_DB: shai_db` | `POSTGRES_DB: shai_db${HTTP_PORT:-6000}` |
| 3 | Postgres healthcheck `pg_isready -d` | `postgres` service → `healthcheck.test` (`CMD-SHELL`) | `pg_isready -U shai_user -d shai_db` | `pg_isready -U shai_user -d shai_db${HTTP_PORT:-6000}` |
| 4 | Ingest `PG_DB` | `ingest` service → `environment` | `PG_DB=shai_db` | `PG_DB=shai_db${HTTP_PORT:-6000}` |

For the default (`HTTP_PORT` unset), all four resolve to `shai_db6000`; for `HTTP_PORT=6100`, all four resolve to `shai_db6100`. This directly satisfies Requirements 2, 3, 4, 5, and the cross-stack consistency of Requirement 7.1 / 7.2.

**Unchanged connection attributes** (per AC 2.2, 4.3, 5.3): user `shai_user`, password source `${POSTGRES_PASSWORD:-shai_password}`, host `postgres`, port `5432` are all preserved exactly.

### Volume-Naming Approach

Requirement 6 asks for a distinct data volume per instance. Compose has a specific constraint here:

- The **key** under the top-level `volumes:` block (for example `postgres_data`) is a static YAML identifier and **cannot** contain `${...}` interpolation.
- However, the volume's **`name:` property** — the physical Docker volume name — **can** be an interpolated value.

So the alias `postgres_data` is kept as the key (and remains what the service mounts), while its physical name is made per-instance:

```yaml
volumes:
  postgres_data:
    name: shai-postgres-data-${HTTP_PORT:-6000}
  app_data:
```

The `postgres` service continues to mount the alias unchanged:

```yaml
    volumes:
      - postgres_data:/var/lib/postgresql/data
```

Effect:

- With `HTTP_PORT=6100`, the physical volume is `shai-postgres-data-6100`.
- With `HTTP_PORT` unset, the physical volume is `shai-postgres-data-6000` (AC 6.4).
- Two instances with different `HTTP_PORT` values get distinct physical volumes (AC 6.2), while both service definitions still reference the `postgres_data` alias and mount it at `/var/lib/postgresql/data` (AC 6.3).

`app_data` is left as-is because it is out of scope for database isolation; only the PostgreSQL data volume needs per-instance naming.

> Note: Compose normally prefixes volume names with the project name. Setting an explicit `name:` makes the physical name exactly the interpolated string (no project prefix), which keeps per-instance names predictable across projects on the same host.

## Data Models

This feature has no runtime data structures; the "data" is the set of derived string values that Compose computes at parse time and the structured connection URL that embeds one of them.

### Instance_Database_Name

- **Format:** `shai_db${HTTP_PORT:-6000}` → literal prefix `shai_db` concatenated with the resolved `HTTP_PORT` (or `6000` when unset/empty).
- **Example values:** `shai_db6000` (default), `shai_db6100` (when `HTTP_PORT=6100`).
- **Consumers:** `DATABASE_URL` (app), `POSTGRES_DB` (postgres), healthcheck `-d` argument (postgres), `PG_DB` (ingest).
- **Invariant:** all four consumers within one instance resolve to the same value.

### Postgres_Data_Volume name

- **Format:** `shai-postgres-data-${HTTP_PORT:-6000}` → literal prefix `shai-postgres-data-` concatenated with the resolved `HTTP_PORT` (or `6000` when unset/empty).
- **Example values:** `shai-postgres-data-6000` (default), `shai-postgres-data-6100` (when `HTTP_PORT=6100`).
- **Alias key:** `postgres_data` (static YAML identifier the service mounts at `/var/lib/postgresql/data`).
- **Physical name:** the interpolated value above, set via the volume's `name:` property.

### DATABASE_URL structure

The application connection string embeds `Instance_Database_Name` as its database path segment while keeping all other attributes constant:

```
postgresql://shai_user:${POSTGRES_PASSWORD:-shai_password}@postgres:5432/shai_db${HTTP_PORT:-6000}
             └───┬────┘ └──────────┬───────────────────┘ └──┬───┘ └┬─┘ └──────────┬──────────┘
              user            password source              host    port   Instance_Database_Name
```

- **user:** `shai_user` (constant)
- **password source:** `${POSTGRES_PASSWORD:-shai_password}` (constant)
- **host:** `postgres` (constant)
- **port:** `5432` (constant)
- **database:** `Instance_Database_Name` (derived, per-instance)

## First-Initialization Caveat

The official Postgres image only honors `POSTGRES_DB` (and `POSTGRES_USER` / `POSTGRES_PASSWORD`) **when the data directory is empty** — that is, on first initialization of a fresh data volume. If a data volume already contains an initialized cluster, the image skips initialization and `POSTGRES_DB` has no effect.

This is exactly why the per-instance **volume naming** is essential and complements the `POSTGRES_DB` change:

- Because each instance now points at its own freshly-named (and therefore initially empty) volume, Postgres initializes that volume and creates the per-instance database `shai_db<HTTP_PORT>` on first start (AC 3.2).
- Without the per-instance volume, a new instance pointed at an already-initialized shared volume would **not** get its database created, and `POSTGRES_DB` would be silently ignored.

## Error Handling

Because this is a declarative, parse-time configuration change, there are no runtime exceptions to catch. The relevant "error handling" is about failure and edge modes of the configuration and the operational risks they introduce. Each is handled by design as described below.

- **Database not created on a pre-existing volume:** The Postgres image only honors `POSTGRES_DB` when the data directory is empty. Pointing a new instance at an already-initialized volume would silently skip database creation. This is handled by the per-instance volume naming (see First-Initialization Caveat): each instance targets a freshly-named, initially-empty volume, so Postgres always initializes and creates `shai_db<HTTP_PORT>`.
- **Unset or empty `HTTP_PORT`:** The `:-6000` default guards both unset and empty values, so the derived names remain well-defined (`shai_db6000` / `shai-postgres-data-6000`) rather than producing malformed strings like `shai_db` or `shai-postgres-data-`.
- **No automatic data migration:** Switching to a new per-instance volume does not migrate existing data. This is an accepted, documented operational consequence — not a silent failure — and is called out for release notes so operators can dump-and-restore when needed.
- **Name-collision safety:** Distinct `HTTP_PORT` values (already required, since `HTTP_PORT` maps a host port) guarantee distinct database and volume names, preventing cross-instance collisions.

The specific edge cases and the migration note follow.

### Edge Cases and Migration Note

- **Pre-existing shared `postgres_data` volume:** Existing deployments have a volume that Compose named with the default project prefix (typically `<project>_postgres_data`) containing the old `shai_db` database. After this change, an instance points at `shai-postgres-data-<HTTP_PORT>` instead, which is a *different, empty* volume. On first start against it, Postgres creates a fresh `shai_db<HTTP_PORT>` database. **Existing data in the old volume is not automatically migrated.** Operators who need to preserve existing data must either (a) copy/dump-and-restore from the old database into the new per-instance database, or (b) pre-create the target volume from the old data. This is an operational step outside the config change and should be called out in the change's release notes.
- **`HTTP_PORT` changes between runs of the same instance definition (AC 7.2):** Because all four sites and the volume name read `HTTP_PORT` directly, changing `HTTP_PORT` recomputes both the database name and the volume name consistently. Practically, this means the instance will point at a new (empty) volume and create a new database matching the new port — the operator should be aware that changing `HTTP_PORT` effectively switches the instance to a fresh database unless the data is migrated.
- **Empty vs unset `HTTP_PORT`:** The `:-6000` form applies the default for both unset and empty values, so a blank `HTTP_PORT` still yields `shai_db6000` / `shai-postgres-data-6000`, keeping behavior well-defined (Requirements 1.2, 2.3, 3.3, 5.2, 6.4).
- **Name-collision safety:** Two instances must use distinct `HTTP_PORT` values (they already must, since `HTTP_PORT` maps a host port). Distinct ports guarantee distinct database names and distinct volume names, so there is no cross-instance collision (AC 1.3, 6.2).

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — a formal statement about what the system should do.*

This change is a declarative configuration edit to `docker-compose.yml` (variable interpolation and a volume `name:` property). Its correctness is about Compose's parse-time string substitution, not about runtime logic in the project's own code. There is no pure function, parser, serializer, or data transformation under test here, so property-based testing is not applicable (this falls under the Infrastructure-as-Code / configuration category). Verification is instead performed by rendering the resolved configuration and asserting the resulting strings.

The invariants the configuration must satisfy are stated below as verifiable properties, validated by example-based checks against rendered Compose output (see Testing Strategy). Note: property-based testing (PBT) is **not applicable** for this IaC/config change — these properties are verified by rendered-configuration checks, not randomized generators.

### Property 1: Single consistent database name across all four sites

For a given `HTTP_PORT`, the resolved database name at `DATABASE_URL`, `POSTGRES_DB`, the healthcheck `-d` argument, and `PG_DB` are all equal to `shai_db<HTTP_PORT>` (default `shai_db6000` when unset).

**Validates: Requirements 1.1, 2.1, 3.1, 4.1, 5.1, 7.1, 7.2**

### Property 2: Distinct per-instance volume

For a given `HTTP_PORT`, the physical `postgres_data` volume name resolves to `shai-postgres-data-<HTTP_PORT>` (default `shai-postgres-data-6000`), and the service mounts it at `/var/lib/postgresql/data`.

**Validates: Requirements 6.1, 6.2, 6.3, 6.4**

### Property 3: Preserved connection attributes

For any `HTTP_PORT`, the resolved `DATABASE_URL` retains user `shai_user`, password `${POSTGRES_PASSWORD:-shai_password}`, host `postgres`, and port `5432`; the healthcheck retains user `shai_user`; and the ingest service retains host `postgres`, user `shai_user`, and password source `POSTGRES_PASSWORD`.

**Validates: Requirements 2.2, 4.3, 5.3**

## Testing Strategy

Because this is a configuration-only change, verification uses **rendered-configuration checks** rather than property-based tests:

- **Config render check (default):** Run `docker compose config` with no `HTTP_PORT` set and assert the rendered output contains `shai_db6000` at all four sites and `shai-postgres-data-6000` as the volume name.
- **Config render check (explicit port):** Run `docker compose config` with `HTTP_PORT=6100` and assert all four sites resolve to `shai_db6100` and the volume name to `shai-postgres-data-6100`.
- **Consistency check:** From a single rendered output, assert the four database-name occurrences are byte-for-byte equal.
- **Preserved-attributes check:** Assert `DATABASE_URL` still contains `shai_user`, `@postgres:5432/`, and the password reference.

These checks operate purely on Compose's rendered output and require no running containers.

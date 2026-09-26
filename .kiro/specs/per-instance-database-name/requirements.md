# Requirements Document

## Introduction

The `ai-shai-web-interface` project runs its services through `docker-compose.yml`. Multiple instances of the stack can run on the same host, differentiated by the `HTTP_PORT` value that maps the application's exposed port. Today every instance targets a single, statically-named PostgreSQL database (`shai_db`) stored in a single shared named volume (`postgres_data`). As a result, separate instances share the same database and data directory, so they cannot maintain independent data.

This feature makes the PostgreSQL database name derive from `HTTP_PORT` so that each instance owns a separate database that holds all of its own data. To make this isolation real rather than cosmetic, the change keeps every reference to the database name consistent across the Compose stack (application connection string, PostgreSQL initialization variable, health check, and the ingest job), ensures the per-instance database is actually created for each instance, and gives each instance its own PostgreSQL data volume.

The scope of this feature is limited to configuration in `docker-compose.yml` (and any supporting Compose-level configuration). No application source code changes are in scope.

## Glossary

- **Compose_Stack**: The set of services defined in `docker-compose.yml` (postgres, ai-shai-web-interface, ingest, frontend, nginx).
- **HTTP_PORT**: The environment variable that sets the host port mapped to the application service. Its established default is `6000`.
- **Instance**: One running deployment of the Compose_Stack, identified by its `HTTP_PORT` value.
- **Instance_Database_Name**: The PostgreSQL database name for an Instance, formed by directly concatenating the base name `shai_db` with the value of `HTTP_PORT` (for example, `shai_db6000`).
- **Postgres_Service**: The `postgres` service in the Compose_Stack, which initializes and hosts the PostgreSQL database.
- **App_Service**: The `ai-shai-web-interface` application service, which connects to PostgreSQL using its `DATABASE_URL` environment variable.
- **Ingest_Service**: The `ingest` service, run on demand under the `ingest` profile, which targets a database through its `PG_DB` environment variable.
- **Postgres_Data_Volume**: The named Docker volume that stores the PostgreSQL data directory for an Instance.
- **Database_Connection_String**: The `DATABASE_URL` value used by the App_Service to connect to PostgreSQL.
- **Health_Check**: The Postgres_Service `pg_isready` command that reports whether the database is ready to accept connections.

## Requirements

### Requirement 1: Derive the database name from HTTP_PORT

**User Story:** As an operator running multiple instances, I want each instance's database name to be derived from its HTTP_PORT, so that each instance addresses its own separate database.

#### Acceptance Criteria

1. THE Compose_Stack SHALL define the Instance_Database_Name by directly concatenating the base name `shai_db` with the value of HTTP_PORT.
2. WHERE HTTP_PORT is not set, THE Compose_Stack SHALL use the value `6000` when forming the Instance_Database_Name, producing `shai_db6000`.
3. WHEN two Instances run with different HTTP_PORT values, THE Compose_Stack SHALL produce a distinct Instance_Database_Name for each Instance.

### Requirement 2: Keep the application connection string consistent

**User Story:** As an operator, I want the application's connection string to point at the per-instance database, so that the application reads and writes its own instance data.

#### Acceptance Criteria

1. THE App_Service SHALL set its Database_Connection_String to reference the Instance_Database_Name.
2. THE App_Service Database_Connection_String SHALL retain the existing user `shai_user`, the existing password source `POSTGRES_PASSWORD` with its default `shai_password`, the host `postgres`, and the port `5432`.
3. WHERE HTTP_PORT is not set, THE App_Service SHALL set its Database_Connection_String to reference `shai_db6000`.

### Requirement 3: Keep the PostgreSQL initialization database name consistent

**User Story:** As an operator, I want PostgreSQL to initialize the per-instance database, so that the database the application connects to actually exists.

#### Acceptance Criteria

1. THE Postgres_Service SHALL set its initialization database name variable (`POSTGRES_DB`) to the Instance_Database_Name.
2. WHEN a Postgres_Service starts against an uninitialized Postgres_Data_Volume, THE Postgres_Service SHALL create a database whose name equals the Instance_Database_Name.
3. WHERE HTTP_PORT is not set, THE Postgres_Service SHALL set its initialization database name variable to `shai_db6000`.

### Requirement 4: Keep the health check consistent

**User Story:** As an operator, I want the database health check to target the per-instance database, so that dependent services start only after the correct database is ready.

#### Acceptance Criteria

1. THE Postgres_Service Health_Check SHALL reference the Instance_Database_Name as its target database.
2. WHEN the Instance_Database_Name is ready to accept connections, THE Postgres_Service Health_Check SHALL report a healthy status.
3. THE Postgres_Service Health_Check SHALL reference the existing user `shai_user`.

### Requirement 5: Keep the ingest service consistent

**User Story:** As an operator running RAG ingestion, I want the ingest job to target the per-instance database, so that ingested embeddings are written to the same database the application uses.

#### Acceptance Criteria

1. THE Ingest_Service SHALL set its target database variable (`PG_DB`) to the Instance_Database_Name.
2. WHERE HTTP_PORT is not set, THE Ingest_Service SHALL set its target database variable to `shai_db6000`.
3. THE Ingest_Service SHALL retain the existing values for host (`postgres`), user (`shai_user`), and password source (`POSTGRES_PASSWORD` with its default `shai_password`).

### Requirement 6: Provide per-instance data isolation through separate data volumes

**User Story:** As an operator, I want each instance to store its PostgreSQL data in its own volume, so that instances do not share a data directory and each instance's database is genuinely isolated.

#### Acceptance Criteria

1. THE Compose_Stack SHALL name each Postgres_Data_Volume so that the name includes the value of HTTP_PORT.
2. WHEN two Instances run with different HTTP_PORT values, THE Compose_Stack SHALL assign each Instance a distinct Postgres_Data_Volume.
3. THE Postgres_Service SHALL mount the Postgres_Data_Volume at the PostgreSQL data directory path `/var/lib/postgresql/data`.
4. WHERE HTTP_PORT is not set, THE Compose_Stack SHALL derive the Postgres_Data_Volume name using the value `6000`.

### Requirement 7: Maintain naming consistency across the stack

**User Story:** As an operator, I want every reference to the database name to agree within a single instance, so that the application, initialization, health check, and ingest job all resolve to the same database.

#### Acceptance Criteria

1. WHILE an Instance runs, THE Compose_Stack SHALL resolve the App_Service Database_Connection_String database name, the Postgres_Service initialization database name, the Health_Check target database, and the Ingest_Service target database to the same Instance_Database_Name.
2. IF HTTP_PORT changes between runs of the same Instance definition, THEN THE Compose_Stack SHALL recompute the Instance_Database_Name and the Postgres_Data_Volume name from the new HTTP_PORT value for all four references.

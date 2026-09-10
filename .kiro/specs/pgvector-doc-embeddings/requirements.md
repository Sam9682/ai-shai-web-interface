# Requirements Document

## Introduction

This feature enables Retrieval-Augmented Generation (RAG) for the AI-SHAI web interface by ingesting documentation content into a vector store backed by pgvector. The pgvector extension is enabled inside the existing PostgreSQL container and shares the same application database (`shai_db`), avoiding a separate vector database deployment. Documentation stored as Markdown files and PDF files is chunked, embedded via the OVH AI Endpoint (Qwen3-Embedding-8B, 4096 dimensions), and persisted into the `md_embeddings` table alongside the application's existing tables.

The scope covers: switching the compose PostgreSQL image to a pgvector-enabled image while preserving the existing application schema and Alembic migrations, reconciling `PG_*` configuration so the vector store points at `shai_db`, provisioning the vector extension and the `md_embeddings` table, and delivering a standalone, re-runnable, idempotent ingestion script that processes both Markdown and PDF documents with credential validation. Existing provider behavior and its tests are preserved.

## Glossary

- **Vector_Store**: The pgvector-backed storage consisting of the `vector` extension and the `md_embeddings` table within the `shai_db` database.
- **Ingestion_Script**: The standalone Python script (`scripts/ingest_embeddings.py`) that reads documentation files, produces embeddings, and writes rows to the `md_embeddings` table.
- **Embedding_Provider**: The OVH AI Endpoint service (Qwen3-Embedding-8B model, 4096-dimensional output) accessed via `OVH_AI_ENDPOINT` and `OVH_AI_TOKEN`.
- **Companion_Provider**: The existing `OpcpCompanionProvider` in `app/oracle/ai_providers.py`, which exposes `ensure_vector_store(conn)`.
- **md_embeddings**: The database table storing embedding rows with columns `title`, `file_path`, `chunk_index`, `content`, and `embedding vector(EMBEDDING_DIM)`.
- **Postgres_Service**: The `postgres` service defined in `docker-compose.yml`.
- **Docs_Source**: The documentation directories: `docs/` for Markdown files and `docs/to_publish/` for PDF files.
- **EMBEDDING_DIM**: The configured embedding vector dimension, equal to 4096 for the Qwen3-Embedding-8B model.
- **Chunk**: A contiguous segment of a document's text produced by the chunking process, associated with a `chunk_index`.
- **PG_Config**: The set of connection settings `PG_HOST`, `PG_PORT`, `PG_DB`, `PG_USER`, `PG_PASSWORD` defined in `app/config.py`.

## Requirements

### Requirement 1

**User Story:** As a platform operator, I want the PostgreSQL container to support pgvector while continuing to serve the application database, so that the vector store and application data share a single database deployment.

#### Acceptance Criteria

1. THE Postgres_Service SHALL use a container image that provides the pgvector `vector` extension and PostgreSQL major version 15.
2. WHEN the Postgres_Service starts with the pgvector-enabled image, THE Postgres_Service SHALL serve the existing `shai_db` database with its application schema.
3. WHEN Alembic migrations run against the Postgres_Service, THE Postgres_Service SHALL apply the application migrations against `shai_db`.
4. THE Postgres_Service SHALL retain the existing `shai_db` database name, `shai_user` user, `pg_isready` healthcheck, and `postgres_data` volume.
5. WHERE the `vector` extension is requested, THE Postgres_Service SHALL make the pgvector `vector` type available within `shai_db`.

### Requirement 2

**User Story:** As a developer, I want the `PG_*` configuration reconciled to point at the application database, so that the vector store operates against `shai_db` on the `postgres` service.

#### Acceptance Criteria

1. THE PG_Config SHALL resolve `PG_HOST` to the `postgres` service hostname.
2. THE PG_Config SHALL resolve `PG_DB` to `shai_db`.
3. THE PG_Config SHALL resolve `PG_USER` to `shai_user`.
4. THE PG_Config SHALL resolve `PG_PORT` to the PostgreSQL port exposed by the Postgres_Service.
5. WHERE `DATABASE_URL` and PG_Config both target PostgreSQL, THE PG_Config SHALL reference the same database (`shai_db`) and the same Postgres_Service as `DATABASE_URL`.
6. THE PG_Config SHALL define `PG_HOST`, `PG_PORT`, `PG_DB`, `PG_USER`, and `PG_PASSWORD` entries in the environment example files.

### Requirement 3

**User Story:** As a platform operator, I want the vector extension and embeddings table provisioned automatically, so that ingestion and query operations can persist and read embeddings.

#### Acceptance Criteria

1. WHEN `ensure_vector_store` runs against a connection, THE Companion_Provider SHALL create the `vector` extension if the extension is absent.
2. WHEN `ensure_vector_store` runs against a connection, THE Companion_Provider SHALL create the `md_embeddings` table if the table is absent, with columns `title`, `file_path`, `chunk_index`, `content`, and `embedding` of type `vector(EMBEDDING_DIM)`.
3. WHEN `ensure_vector_store` runs more than once against the same database, THE Companion_Provider SHALL produce the same Vector_Store state without error.
4. THE Companion_Provider SHALL set the `embedding` column dimension to the configured EMBEDDING_DIM value of 4096.

### Requirement 4

**User Story:** As a content maintainer, I want a standalone ingestion script that processes both Markdown and PDF documents, so that documentation content becomes searchable through the vector store.

#### Acceptance Criteria

1. THE Ingestion_Script SHALL be an independently invocable Python script located at `scripts/ingest_embeddings.py`.
2. WHEN the Ingestion_Script runs, THE Ingestion_Script SHALL read Markdown files from `docs/` and PDF files from `docs/to_publish/`.
3. WHEN the Ingestion_Script processes a PDF file, THE Ingestion_Script SHALL extract the text content of the PDF file before chunking.
4. WHEN the Ingestion_Script processes a document, THE Ingestion_Script SHALL divide the document text into Chunks and assign each Chunk a sequential `chunk_index` starting at 0 within that document.
5. WHEN the Ingestion_Script produces a Chunk, THE Ingestion_Script SHALL request an embedding from the Embedding_Provider for that Chunk.
6. WHEN the Ingestion_Script receives an embedding for a Chunk, THE Ingestion_Script SHALL insert a row into `md_embeddings` containing the document `title`, `file_path`, `chunk_index`, `content`, and `embedding`.
7. WHEN the Ingestion_Script starts, THE Ingestion_Script SHALL ensure the Vector_Store exists before inserting rows.
8. THE Ingestion_Script SHALL support execution both as a manual command and as a Docker Compose one-off task.

### Requirement 5

**User Story:** As a content maintainer, I want ingestion to be re-runnable without duplicating data, so that repeated runs keep the vector store consistent.

#### Acceptance Criteria

1. WHEN the Ingestion_Script runs more than once over the same Docs_Source, THE Ingestion_Script SHALL leave the `md_embeddings` table without duplicate rows for the same `file_path` and `chunk_index` combination.
2. WHEN the Ingestion_Script re-processes a document that was previously ingested, THE Ingestion_Script SHALL replace the previously stored Chunks for that document with the newly produced Chunks.

### Requirement 6

**User Story:** As a platform operator, I want ingestion to require real OVH credentials and fail clearly when they are missing, so that no invalid or partial ingestion occurs.

#### Acceptance Criteria

1. WHEN the Ingestion_Script starts, THE Ingestion_Script SHALL read `OVH_AI_ENDPOINT` and `OVH_AI_TOKEN` from configuration.
2. IF `OVH_AI_ENDPOINT` is missing or empty, THEN THE Ingestion_Script SHALL terminate with a non-zero exit code and an error message identifying the missing credential.
3. IF `OVH_AI_TOKEN` is missing or empty, THEN THE Ingestion_Script SHALL terminate with a non-zero exit code and an error message identifying the missing credential.
4. THE Ingestion_Script SHALL request embeddings from the Embedding_Provider using the Qwen3-Embedding-8B model producing 4096-dimensional vectors.
5. THE Ingestion_Script SHALL document `OVH_AI_ENDPOINT` and `OVH_AI_TOKEN` in the environment example files.

### Requirement 7

**User Story:** As a developer, I want existing provider behavior and tests preserved, so that this feature does not regress current functionality.

#### Acceptance Criteria

1. THE Companion_Provider SHALL retain the existing `ensure_vector_store(conn)` behavior verified by the tests in `tests/test_opcp_companion_provider.py`.
2. WHEN the existing provider test suite runs, THE Companion_Provider SHALL pass the `ensure_vector_store` idempotency test and the `md_embeddings` missing-table test.
3. THE Companion_Provider SHALL retain query-time embedding behavior for existing callers.

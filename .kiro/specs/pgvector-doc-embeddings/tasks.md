# Implementation Plan: pgvector-doc-embeddings

## Overview

This plan implements RAG document ingestion backed by pgvector inside the existing PostgreSQL container. Work proceeds in buildable increments: first the infrastructure/config surface (compose image switch, `PG_*` reconciliation, env docs, dependency), then the standalone ingestion script built bottom-up (discovery → extraction → chunking → embedding → idempotent upsert → orchestration/credential-validation), then the regression fix to the single defaults assertion, with property-based and unit/config tests placed next to the code they validate. Each step builds on the previous and ends with the ingestion module fully wired via `main()` and the `__main__` guard.

All code is Python (script + tests) and YAML (compose), as fixed by the design. The design includes a Correctness Properties section, so property-based test sub-tasks (Hypothesis) are included and marked optional.

## Tasks

- [x] 1. Infrastructure and configuration surface
  - [x] 1.1 Switch the `postgres` service image to pgvector and add the one-off `ingest` service
    - In `docker-compose.yml`, change the `postgres` service image from `postgres:15-alpine` to `pgvector/pgvector:pg15`, preserving `POSTGRES_DB=shai_db`, `POSTGRES_USER=shai_user`, `POSTGRES_PASSWORD`, `POSTGRES_INITDB_ARGS`, the `pg_isready` healthcheck, and the `postgres_data` volume unchanged
    - Add a new `ingest` service under `profiles: ["ingest"]` that builds from the existing `Dockerfile`, loads `.env`, sets `PG_HOST=postgres`/`PG_DB=shai_db`/`PG_USER=shai_user`/`PG_PASSWORD`, `depends_on` postgres `service_healthy`, runs `command: ["python", "-m", "scripts.ingest_embeddings"]`, and joins the existing network
    - _Requirements: 1.1, 1.4, 4.8_
    - _Design: Components and Interfaces §1, §2_

  - [x]* 1.2 Write compose smoke tests
    - Parse `docker-compose.yml` and assert `postgres.image == "pgvector/pgvector:pg15"`, `POSTGRES_DB=shai_db`, `POSTGRES_USER=shai_user`, the `pg_isready` healthcheck present, and the `postgres_data` volume retained
    - Assert the `ingest` service exists under the `ingest` profile with the `python -m scripts.ingest_embeddings` command
    - _Requirements: 1.1, 1.4, 4.8_
    - _Design: Testing Strategy → Config / smoke tests_

  - [x] 1.3 Reconcile `PG_*` defaults in `app/config.py`
    - Update `Settings` defaults to `PG_HOST="postgres"`, `PG_PORT=5432`, `PG_DB="shai_db"`, `PG_USER="shai_user"`, `PG_PASSWORD=""`, `TABLE_NAME="md_embeddings"`, so `PG_*` aligns with `DATABASE_URL` (`shai_db` @ `postgres`)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_
    - _Design: Components and Interfaces §3_

  - [x] 1.4 Document `PG_*` and OVH RAG vars in the env example files
    - Create `.env.example` at the repo root with the RAG block: `OVH_AI_ENDPOINT`, `OVH_AI_TOKEN`, `EMBEDDING_MODEL`, `EMBEDDING_DIM`, and `PG_HOST=postgres`/`PG_PORT=5432`/`PG_DB=shai_db`/`PG_USER=shai_user`/`PG_PASSWORD`/`TABLE_NAME=md_embeddings`
    - Ensure `.env.prod.example` documents the same `PG_*` and `OVH_AI_ENDPOINT`/`OVH_AI_TOKEN` values (add any missing entries)
    - _Requirements: 2.6, 6.5_
    - _Design: Components and Interfaces §4_

  - [x] 1.5 Add the `pypdf` dependency
    - Add `pypdf==5.1.0` to `requirements.txt` for PDF text extraction
    - _Requirements: 4.3_
    - _Design: Components and Interfaces §5 (PDF text extraction)_

  - [x]* 1.6 Write config and env documentation tests
    - Assert reconciled `Settings` defaults (`PG_HOST`, `PG_PORT`, `PG_DB`, `PG_USER`) and that the host/db parsed from `DATABASE_URL` match `PG_HOST`/`PG_DB`
    - Assert `.env.example` and `.env.prod.example` document `PG_HOST=postgres`, `PG_DB=shai_db`, `PG_USER=shai_user`, `PG_PORT`, `PG_PASSWORD`, `OVH_AI_ENDPOINT`, `OVH_AI_TOKEN`
    - Assert `pypdf` is declared in `requirements.txt`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 4.3, 6.5_
    - _Design: Testing Strategy → Config / smoke tests_

- [x] 2. Checkpoint - Ensure infrastructure/config tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 3. Ingestion script scaffolding and document discovery
  - [x] 3.1 Create the ingestion module skeleton with `DocFile` and entry point
    - Create `scripts/ingest_embeddings.py` with the `DocFile` dataclass (`path`, `title`, `kind`), a `main() -> int` stub, and the `if __name__ == "__main__": sys.exit(main())` guard
    - Ensure the module is runnable via `python -m scripts.ingest_embeddings` (package `__init__.py` present if needed)
    - _Requirements: 4.1, 4.8_
    - _Design: Components and Interfaces §5; Data Models → DocFile_

  - [x] 3.2 Implement `discover_documents`
    - Return `.md` files located directly under `docs/` plus `.pdf` files under `docs/to_publish/`; exclude any other extension or location; take directories from settings so tests can point at temp dirs
    - _Requirements: 4.2_
    - _Design: Components and Interfaces §5 (Document discovery)_

  - [x]* 3.3 Write property test for document discovery
    - **Property 2: Document discovery selects exactly the intended files**
    - **Validates: Requirements 4.2**
    - Generate temp directory trees mixing `.md`, `.pdf`, and other extensions across `docs/` and `docs/to_publish/`; assert `discover_documents` returns exactly the expected set

- [x] 4. Text extraction and chunking
  - [x] 4.1 Implement `extract_text`
    - Read `.md` files as UTF-8 text; extract `.pdf` text via `pypdf`
    - _Requirements: 4.3_
    - _Design: Components and Interfaces §5 (PDF text extraction); Ingestion Sequence step 7_

  - [x]* 4.2 Write PDF extraction edge-case test
    - Extract text from a tiny bundled PDF fixture and assert non-empty text flows into chunking
    - _Requirements: 4.3_
    - _Design: Testing Strategy → Example / edge-case unit tests_

  - [x] 4.3 Implement `chunk_text`
    - Split text into contiguous fixed-size character chunks with small overlap (defaults `chunk_size=1000`, `overlap=100`); produce chunks in document order so `chunk_index` runs `0..n-1` and non-overlapping portions reconstruct the input
    - _Requirements: 4.4_
    - _Design: Components and Interfaces §5 (Chunking strategy)_

  - [x]* 4.4 Write property test for chunking
    - **Property 3: Chunking produces contiguous, fully-covering indices**
    - **Validates: Requirements 4.4**
    - Generate arbitrary text; assert chunk indices are `0..n-1` contiguous and concatenated chunk contents cover the input with no gaps

- [x] 5. Checkpoint - Ensure discovery/extraction/chunking tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Embedding, provisioning, and idempotent upsert
  - [x] 6.1 Implement `ingest_file` with provisioning-first, per-chunk embedding, and delete-then-insert upsert
    - Reuse `provider._get_embed_client()` / `provider._embed_query(client, chunk)` (Qwen3-Embedding-8B, 4096-dim) to embed each produced chunk
    - Within a per-file transaction: `DELETE FROM md_embeddings WHERE file_path = %s`, then `INSERT` rows carrying `(title, file_path, chunk_index, content, embedding)` using the `"[v1,v2,...]"` vector string cast with `%s::vector`; commit per file
    - Assume `ensure_vector_store(conn)` has already been called before any insert (orchestrated in task 7.1)
    - Return the chunk count for the file
    - _Requirements: 4.5, 4.6, 4.7, 5.1, 5.2, 6.4_
    - _Design: Components and Interfaces §5 (Embedding, Idempotent upsert, Vector serialization); Ingestion Sequence steps 4–7_

  - [-]* 6.2 Write per-chunk embedding, insert-mapping, and model/dimension unit tests
    - With a mocked embed client, assert one embedding request per produced chunk (Req 4.5)
    - With a fake cursor, assert inserted tuples carry `(title, file_path, chunk_index, content, embedding)` (Req 4.6)
    - Assert embedding goes through the provider path using `EMBEDDING_MODEL` and that a wrong-length vector raises (Req 6.4)
    - _Requirements: 4.5, 4.6, 6.4_
    - _Design: Testing Strategy → Example / edge-case unit tests_

  - [-]* 6.3 Write property test for re-run idempotency
    - **Property 4: Ingestion is idempotent over re-runs (no duplicate rows)**
    - **Validates: Requirements 5.1**
    - With a fake connection modeling the table as a row store, ingest a generated doc set twice; assert no duplicate `(file_path, chunk_index)` rows and that the two-run result equals the single-run result

  - [-]* 6.4 Write property test for changed-document replacement
    - **Property 5: Re-ingesting a changed document replaces its chunks**
    - **Validates: Requirements 5.2**
    - Ingest a file, then re-ingest with different generated content; assert stored rows for that `file_path` equal exactly the new chunks with no stale rows remaining

- [x] 7. Orchestration, credential validation, and wiring
  - [x] 7.1 Implement `validate_credentials` and wire `main()`
    - `validate_credentials(settings)`: if `OVH_AI_ENDPOINT` or `OVH_AI_TOKEN` is missing/empty/whitespace, print an error to stderr naming the specific variable and cause a non-zero exit; no DB or embedding work attempted
    - `main()`: call `validate_credentials`, construct `OpcpCompanionProvider()`, open the connection via `provider._get_pg_connection()`, call `provider.ensure_vector_store(conn)` before any insert, build the embed client, `discover_documents`, iterate calling `ingest_file` per file (continue past a bad PDF but exit non-zero if any file failed), commit, close, and return the process exit code
    - _Requirements: 4.7, 6.1, 6.2, 6.3, 6.4_
    - _Design: Components and Interfaces §5 (Credential validation, Provisioning first); Ingestion Sequence steps 1–8; Error Handling_

  - [-]* 7.2 Write provision-before-insert and missing-credentials unit tests
    - Assert `ensure_vector_store` is called before any `INSERT` (Req 4.7)
    - For empty and whitespace `OVH_AI_ENDPOINT`/`OVH_AI_TOKEN`, assert `main()` returns non-zero and the message names the specific variable (Req 6.2, 6.3)
    - _Requirements: 4.7, 6.2, 6.3_
    - _Design: Testing Strategy → Example / edge-case unit tests_

  - [-]* 7.3 Write property test for vector store provisioning idempotency
    - **Property 1: Vector store provisioning is idempotent**
    - **Validates: Requirements 3.1, 3.2, 3.3, 3.4**
    - Repeatedly invoke `ensure_vector_store` against a fake connection recording DDL; assert extension + table present and no error regardless of invocation count

  - [ ]* 7.4 Write entry-point smoke test
    - Assert `scripts/ingest_embeddings.py` exists with a `__main__` guard and an importable `main()` callable
    - _Requirements: 4.1, 4.8_
    - _Design: Testing Strategy → Config / smoke tests_

- [x] 8. Regression preservation for provider tests
  - [x] 8.1 Update the single `PG_*` defaults-equality assertion
    - In `tests/test_opcp_companion_provider.py::test_settings_defaults_match_rag_query`, update the defaults-equality assertion to the reconciled values (`PG_HOST == "postgres"`, `PG_DB == "shai_db"`, `PG_USER == "shai_user"`), preserving all other provider tests (idempotency, missing-table, query contract, wiring, error messages, preservation properties) unchanged
    - _Requirements: 2.5, 7.1, 7.2, 7.3_
    - _Design: Components and Interfaces §3 (Compatibility note); Preserving Existing Provider Behavior; Testing Strategy → Regression preservation_

- [~] 9. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional test sub-tasks and can be skipped for a faster MVP.
- Each task references specific granular requirements and the design sections that inform it.
- Checkpoints ensure incremental validation between infrastructure, the ingestion pipeline, and wiring.
- Property tests (Properties 1–5) are placed next to the code they validate and each is its own sub-task annotated with property number and validated requirements.
- The live-container integration checks (Req 1.2, 1.3, 1.5) are not coding tasks and are intentionally excluded from this plan; they are covered by the design's Integration strategy.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.3", "1.4", "1.5", "3.1", "8.1"] },
    { "id": 1, "tasks": ["1.2", "1.6", "3.2", "4.1", "4.3"] },
    { "id": 2, "tasks": ["3.3", "4.2", "4.4", "6.1"] },
    { "id": 3, "tasks": ["6.2", "6.3", "6.4", "7.1"] },
    { "id": 4, "tasks": ["7.2", "7.3", "7.4"] }
  ]
}
```

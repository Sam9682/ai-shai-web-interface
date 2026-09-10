# Design Document

## Overview

This feature enables RAG document ingestion by hosting the pgvector vector store inside the existing PostgreSQL container, sharing the application database `shai_db`. The design has four moving parts, all grounded in the current repo:

1. **Compose image switch** — replace `postgres:15-alpine` with `pgvector/pgvector:pg15`, a drop-in PG15 superset, so the existing `shai_db` schema, Alembic migrations, and `postgres_data` volume keep working while the `vector` extension becomes available.
2. **`PG_*` config reconciliation** — point the vector store at `shai_db` on the `postgres` service so `PG_*` and `DATABASE_URL` agree, reusing the existing psycopg2 connection path in `OpcpCompanionProvider`.
3. **Vector store provisioning** — reuse the existing, already-tested `OpcpCompanionProvider.ensure_vector_store(conn)` (creates the `vector` extension + `md_embeddings` table idempotently) and call it from the ingestion script at startup.
4. **Standalone ingestion script** — a new `scripts/ingest_embeddings.py` that discovers Markdown and PDF documents, extracts/chunks text, embeds each chunk via the OVH endpoint (reusing the provider's embedding path), and upserts rows into `md_embeddings` idempotently, with credential validation and clear non-zero exits.

No changes are made to the `OpcpCompanionProvider` query pipeline or its DDL, so `tests/test_opcp_companion_provider.py` continues to pass unchanged.

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│ docker-compose.yml                                                 │
│                                                                    │
│  postgres  (pgvector/pgvector:pg15)   ← was postgres:15-alpine     │
│    POSTGRES_DB=shai_db  POSTGRES_USER=shai_user                    │
│    volume: postgres_data  healthcheck: pg_isready                  │
│    └── shai_db                                                     │
│          ├── app schema (Alembic migrations)                       │
│          └── vector extension + md_embeddings table                │
│                                                                    │
│  ai-shai-web-interface (app) ──DATABASE_URL──▶ shai_db             │
│                                                                    │
│  ingest (one-off, profile) ────PG_*────────────▶ shai_db          │
│         python -m scripts.ingest_embeddings                        │
└──────────────────────────────────────────────────────────────────┘

Ingestion flow (scripts/ingest_embeddings.py)
  validate OVH creds ─▶ open PG conn ─▶ ensure_vector_store(conn)
    ─▶ discover docs ─▶ per file: extract text ─▶ chunk
       ─▶ per chunk: embed (OVH) ─▶ upsert row
    ─▶ commit ─▶ exit 0
```

### Why `pgvector/pgvector:pg15` is a safe drop-in

- **Same PostgreSQL major version (15).** The `postgres_data` volume holds a PG15 on-disk data directory (`PGDATA` at `/var/lib/postgresql/data`). Because both images are PostgreSQL 15, the existing data directory layout is compatible and no dump/restore or re-init is required — the volume mounts and the cluster starts against the existing files.
- **Same base image and entrypoint contract.** `pgvector/pgvector:pg15` is built on the official `postgres` image, so it honors the same environment variables (`POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_INITDB_ARGS`), the same `PGDATA` location, and the same `docker-entrypoint.sh` init hooks. `pg_isready` behaves identically.
- **Superset, not replacement.** The only functional addition is that the `vector` extension shared library ships in the image, so `CREATE EXTENSION vector` succeeds. Everything the app relies on (roles, `shai_db`, Alembic migration DDL) is untouched.
- **Alpine → Debian note.** The current tag is `-alpine`; `pgvector/pgvector:pg15` is Debian-based. The data directory format is identical across both for the same PG major version, so the existing `postgres_data` volume remains readable. Locale/collation come from `POSTGRES_INITDB_ARGS` which is preserved. This is the standard, documented way to add pgvector to a PG15 deployment.

## Components and Interfaces

### 1. `docker-compose.yml` — `postgres` service

Single-line change to the image, everything else retained (Req 1.1, 1.4):

```yaml
  postgres:
    image: pgvector/pgvector:pg15   # was: postgres:15-alpine
    environment:
      POSTGRES_DB: shai_db
      POSTGRES_USER: shai_user
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-shai_password}
      POSTGRES_INITDB_ARGS: "--encoding=UTF-8 --lc-collate=C --lc-ctype=C"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U shai_user -d shai_db"]
      # interval/timeout/retries unchanged
```

### 2. `docker-compose.yml` — one-off `ingest` service

A dedicated service under a Compose profile so it does not start with the normal stack, invoked on demand (Req 4.8):

```yaml
  ingest:
    build:
      context: .
      dockerfile: Dockerfile
    profiles: ["ingest"]        # excluded from default `up`
    env_file:
      - .env
    environment:
      - PG_HOST=postgres
      - PG_DB=shai_db
      - PG_USER=shai_user
      - PG_PASSWORD=${POSTGRES_PASSWORD:-shai_password}
    depends_on:
      postgres:
        condition: service_healthy
    command: ["python", "-m", "scripts.ingest_embeddings"]
    networks:
      - shai-network
```

Invocation:

```bash
# Compose one-off (Req 4.8)
docker compose --profile ingest run --rm ingest

# Manual (Req 4.1, 4.8)
python -m scripts.ingest_embeddings
```

### 3. `app/config.py` — `PG_*` reconciliation

Reconcile the `PG_*` defaults so they align with `DATABASE_URL` (`postgresql://shai_user:...@postgres:5432/shai_db`). The current defaults (`localhost`/`vectordb`/`postgres`) are legacy from the standalone RAG tool and must move to the app database (Req 2.1–2.5):

```python
    # pgvector Postgres connection — aligned with DATABASE_URL (shai_db @ postgres service)
    PG_HOST: str = "postgres"
    PG_PORT: int = 5432
    PG_DB: str = "shai_db"
    PG_USER: str = "shai_user"
    PG_PASSWORD: str = ""
    TABLE_NAME: str = "md_embeddings"
```

> Compatibility note: `tests/test_opcp_companion_provider.py::test_settings_defaults_match_rag_query` currently asserts the legacy defaults (`PG_HOST == "localhost"`, `PG_DB == "vectordb"`, `PG_USER == "postgres"`). Changing the defaults will make that specific assertion fail. Per Req 7, the existing provider *behavior* (the `ensure_vector_store`, `_search`, `_chunks_to_sources`, `_build_context`, query-pipeline, and bugfix property tests) must be preserved — those do not depend on the default values. The single defaults-equality assertion is a configuration expectation that this feature intentionally supersedes (Req 2.5 requires alignment with `DATABASE_URL`); it will be updated to assert the reconciled values. No other provider test references these defaults.

The provider's `_get_pg_connection()` (existing psycopg2 path) is reused as-is — it already reads `PG_HOST/PG_PORT/PG_DB/PG_USER/PG_PASSWORD` from `settings`.

### 4. Environment example files

Both `.env.example` (repo root — referenced by the existing test as `REPO_ROOT / ".env.example"`) and `.env.prod.example` must document the reconciled `PG_*` and OVH credentials (Req 2.6, 6.5). `.env.prod.example` already carries the correct values (`PG_HOST=postgres`, `PG_DB=shai_db`, `PG_USER=shai_user`, `OVH_AI_ENDPOINT`, `OVH_AI_TOKEN`). `.env.example` must exist at the repo root with the same RAG block:

```
# OPCP Companion (RAG) Configuration
OVH_AI_ENDPOINT=https://oai.endpoints.kepler.ai.cloud.ovh.net/v1
OVH_AI_TOKEN=!!!YOUR_KEY_HERE!!!
EMBEDDING_MODEL=Qwen3-Embedding-8B
EMBEDDING_DIM=4096
LLM_ENDPOINT=
LLM_TOKEN=
LLM_MODEL=Qwen3-Embedding-8B

# pgvector Postgres connection (aligned with DATABASE_URL: shai_db @ postgres)
PG_HOST=postgres
PG_PORT=5432
PG_DB=shai_db
PG_USER=shai_user
PG_PASSWORD=!!!YOUR_PASSWORD_HERE!!!
TABLE_NAME=md_embeddings
```

The `.env` runtime file (which currently lacks `PG_*`, `OVH_AI_ENDPOINT`, `OVH_AI_TOKEN`) is the operator's responsibility to populate from the example; ingestion fails clearly if OVH credentials are absent (Req 6.2, 6.3).

### 5. `scripts/ingest_embeddings.py` — the ingestion script

A standalone module runnable via `python -m scripts.ingest_embeddings` (Req 4.1). It reuses `OpcpCompanionProvider` for both provisioning and embedding rather than duplicating logic.

Public shape:

```python
def discover_documents(docs_dir: Path, pdf_dir: Path) -> list[DocFile]:
    """Return .md files under docs_dir plus .pdf files under pdf_dir (Req 4.2)."""

def extract_text(doc: DocFile) -> str:
    """Read .md as UTF-8 text; extract .pdf text via pypdf (Req 4.3)."""

def chunk_text(text: str, chunk_size: int, overlap: int) -> list[str]:
    """Split text into contiguous chunks (Req 4.4)."""

def ingest_file(conn, provider, embed_client, doc: DocFile) -> int:
    """Upsert all chunks for one file; returns chunk count (Req 4.5, 4.6, 5.1, 5.2)."""

def validate_credentials(settings) -> None:
    """Raise/exit non-zero if OVH_AI_ENDPOINT or OVH_AI_TOKEN missing (Req 6.2, 6.3)."""

def main() -> int:
    """Orchestrate; return process exit code."""

if __name__ == "__main__":
    sys.exit(main())
```

Key design decisions:

- **Document discovery (Req 4.2).** Markdown from `docs/` (top-level `*.md`), PDFs from `docs/to_publish/` (`*.pdf`). Directories are taken from settings so tests can point them at temp dirs. Non-`.md`/`.pdf` files (e.g. `.doc`, `.txt`) and files outside these locations are ignored.
- **PDF text extraction (Req 4.3).** Use **`pypdf`** (pure-Python, MIT, actively maintained, no system deps — fits the existing Python-only dependency set alongside `reportlab`). Add `pypdf==5.1.0` to `requirements.txt`. Markdown files are read directly as UTF-8 text.
- **Chunking strategy (Req 4.4).** Fixed-size character chunks with a small overlap (defaults: `chunk_size=1000`, `overlap=100`). Chunks are produced in document order with `chunk_index` starting at 0 and incrementing by 1. The chunker guarantees contiguous coverage of the source text (concatenating the non-overlapping portions reconstructs the input).
- **Embedding (Req 4.5, 6.4).** Reuse the provider's embedding path: build the OVH client with `provider._get_embed_client()` and embed each chunk through `provider._embed_query(client, chunk)`, which uses `EMBEDDING_MODEL=Qwen3-Embedding-8B` and validates the returned vector length equals `EMBEDDING_DIM=4096`. No new embedding logic is introduced.
- **Provisioning first (Req 4.7).** After opening the psycopg2 connection, call `provider.ensure_vector_store(conn)` before any insert, so the `vector` extension and `md_embeddings` table exist.
- **Idempotent upsert (Req 5.1, 5.2).** Delete-then-insert per `file_path` within a transaction: `DELETE FROM md_embeddings WHERE file_path = %s`, then insert the freshly produced chunks. This guarantees no duplicate `(file_path, chunk_index)` rows across re-runs and replaces stale chunks when a document changes. The per-file delete+insert is committed together so a re-run is atomic per file. (Delete-then-insert is chosen over `ON CONFLICT` because the vector schema has no unique constraint on `(file_path, chunk_index)` and delete-then-insert also removes now-deleted trailing chunks when a document shrinks.)
- **Credential validation (Req 6.1, 6.2, 6.3).** Before any work, read `settings.OVH_AI_ENDPOINT` and `settings.OVH_AI_TOKEN`. If either is missing or blank (empty/whitespace), print an error naming the specific missing variable to stderr and return a non-zero exit code — no partial ingestion.
- **Vector serialization.** Reuse the same `"[v1,v2,...]"` string format the provider uses for pgvector, cast with `%s::vector` in the INSERT.

## Data Models

### `md_embeddings` table

Provisioned by `OpcpCompanionProvider.ensure_vector_store` (unchanged DDL), living in `shai_db` (Req 3.2, 3.4):

| Column        | Type            | Notes                                             |
|---------------|-----------------|---------------------------------------------------|
| `title`       | `text`          | Document title (derived from file name)           |
| `file_path`   | `text`          | Source path; ingestion key for delete-then-insert |
| `chunk_index` | `integer`       | 0-based sequential index within the document      |
| `content`     | `text`          | Chunk text                                        |
| `embedding`   | `vector(4096)`  | Dimension = `EMBEDDING_DIM` (Qwen3-Embedding-8B)  |

No table alterations, indexes, or constraints are added by this feature; the existing `CREATE TABLE IF NOT EXISTS` DDL is authoritative and shared with the query path.

### `DocFile` (in-memory)

```python
@dataclass
class DocFile:
    path: Path        # absolute/relative file path -> file_path
    title: str        # display title, e.g. path.stem
    kind: str         # "md" | "pdf"
```

## Ingestion Sequence

```
main()
  1. validate_credentials(settings)          # Req 6.1–6.3; non-zero exit on failure
  2. provider = OpcpCompanionProvider()
  3. conn = provider._get_pg_connection()    # reuse PG_* psycopg2 path; Req 2.*
  4. provider.ensure_vector_store(conn)       # Req 3.1–3.4, 4.7 (extension + table)
  5. embed_client = provider._get_embed_client()
  6. docs = discover_documents(docs/, docs/to_publish/)   # Req 4.2
  7. for doc in docs:
        text   = extract_text(doc)            # md read | pdf via pypdf; Req 4.3
        chunks = chunk_text(text, ...)         # Req 4.4 (chunk_index 0..n-1)
        BEGIN
          DELETE FROM md_embeddings WHERE file_path = doc.path   # Req 5.1, 5.2
          for i, chunk in enumerate(chunks):
            vec = provider._embed_query(embed_client, chunk)     # Req 4.5, 6.4
            INSERT INTO md_embeddings
              (title, file_path, chunk_index, content, embedding)
              VALUES (%s, %s, %s, %s, %s::vector)                # Req 4.6
        COMMIT
  8. conn.close(); return 0
```

## Error Handling

- **Missing OVH credentials (Req 6.2, 6.3):** detected up front in `validate_credentials`; prints `ERROR: OVH_AI_ENDPOINT is not set` (or `OVH_AI_TOKEN`) to stderr and returns exit code `1`. No DB connection or embedding call is attempted.
- **Embedding dimension mismatch (Req 6.4):** `_embed_query` already raises if the returned vector length ≠ 4096; the script lets this propagate, aborts the current file's transaction (rollback), and exits non-zero.
- **PDF extraction failure:** if `pypdf` cannot read a file, log the file path and error and continue to the next document (one bad PDF does not abort the whole run); the run still exits non-zero if any file failed, so failures are visible.
- **DB connection / DDL failure:** psycopg2 exceptions from connect or `ensure_vector_store` propagate; the script reports the target `PG_DB`/`PG_HOST` (never `PG_PASSWORD`) and exits non-zero, mirroring the provider's existing non-secret error messages.
- **Transaction safety:** each file's delete+insert runs in one transaction and is committed per file, so an interrupted run leaves previously committed files intact and the failing file unchanged (its old rows survive until a successful re-run replaces them).

## Preserving Existing Provider Behavior (Req 7)

- `OpcpCompanionProvider.ensure_vector_store`, `_search`, `_embed_query`, `_get_pg_connection`, `_chunks_to_sources`, `_build_context`, and `query` are **not modified**. The ingestion script only *calls* the public/provisioning methods.
- `tests/test_opcp_companion_provider.py` is preserved. All behavior tests (idempotency, missing-table bugfix property, query dict contract, wiring, error messages, preservation properties) remain green because none of that code changes.
- The only test touchpoint is the `PG_*` defaults-equality assertion in `test_settings_defaults_match_rag_query`, which is a configuration expectation intentionally superseded by Req 2.5 (alignment with `DATABASE_URL`); it is updated to the reconciled values. This does not alter any provider *behavior*.

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Vector store provisioning is idempotent

*For any* number of repeated invocations of `ensure_vector_store` against the same database connection, the resulting vector store state (the `vector` extension present and the `md_embeddings` table present with its defined columns) is identical and no error is raised.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4**

### Property 2: Document discovery selects exactly the intended files

*For any* documentation directory layout, the set of documents discovered by the ingestion script equals exactly the Markdown files located directly under `docs/` together with the PDF files located under `docs/to_publish/`, and excludes files of any other extension or in any other location.

**Validates: Requirements 4.2**

### Property 3: Chunking produces contiguous, fully-covering indices

*For any* input document text, the chunks produced by the chunker are assigned `chunk_index` values forming a contiguous sequence starting at 0 (0, 1, ..., n-1), and the concatenation of the chunk contents covers the entire source text with no gaps.

**Validates: Requirements 4.4**

### Property 4: Ingestion is idempotent over re-runs (no duplicate rows)

*For any* set of source documents, ingesting them once and then ingesting the same unchanged set again yields a `md_embeddings` table with no duplicate rows for the same `(file_path, chunk_index)` combination — running the ingestion twice produces the same row set as running it once.

**Validates: Requirements 5.1**

### Property 5: Re-ingesting a changed document replaces its chunks

*For any* document that was previously ingested and is then re-ingested with different content, the chunks stored in `md_embeddings` for that document's `file_path` afterward equal exactly the newly produced chunk set, with none of the previously stored chunks for that `file_path` remaining.

**Validates: Requirements 5.2**

## Testing Strategy

Tests use the dependencies already present (`pytest`, `pytest-asyncio`, `hypothesis`). External services (OVH endpoint, live Postgres) are mocked for property/unit tests; a small live check is reserved for integration.

### Property-based tests (min. 100 iterations each, tagged `Feature: pgvector-doc-embeddings, Property N: ...`)

- **Property 1** — repeatedly invoke `ensure_vector_store` against a fake connection recording DDL; assert extension + table are present and no error occurs regardless of invocation count. (Complements the existing provider idempotency coverage.)
- **Property 2** — generate temp directory trees mixing `.md`, `.pdf`, and other extensions across `docs/` and `docs/to_publish/`; assert `discover_documents` returns exactly the expected set.
- **Property 3** — generate arbitrary text; assert chunk indices are `0..n-1` contiguous and concatenated chunk contents reconstruct/cover the input.
- **Property 4** — with a fake connection modeling the table as a row store, ingest a generated doc set twice; assert the final rows contain no duplicate `(file_path, chunk_index)` and equal the single-run result.
- **Property 5** — ingest a file, then re-ingest with different generated content; assert stored rows for that `file_path` equal exactly the new chunks and no stale rows remain.

### Example / edge-case unit tests

- **PDF extraction (Req 4.3):** extract text from a tiny bundled PDF fixture and assert non-empty text flows into chunking.
- **Per-chunk embedding (Req 4.5):** with a mocked embed client, assert one embedding request per produced chunk.
- **Insert mapping (Req 4.6):** with a fake cursor, assert inserted tuples carry `(title, file_path, chunk_index, content, embedding)`.
- **Provision-before-insert (Req 4.7):** assert `ensure_vector_store` is called before any `INSERT`.
- **Missing credentials (Req 6.2, 6.3):** for empty and whitespace `OVH_AI_ENDPOINT`/`OVH_AI_TOKEN`, assert `main()` returns non-zero and the message names the specific variable.
- **Model/dimension (Req 6.4):** assert the script embeds via the provider path using `EMBEDDING_MODEL` and that a wrong-length vector raises.

### Config / smoke tests

- **Compose (Req 1.1, 1.4):** assert `docker-compose.yml` `postgres.image == pgvector/pgvector:pg15` and that `POSTGRES_DB=shai_db`, `POSTGRES_USER=shai_user`, the `pg_isready` healthcheck, and the `postgres_data` volume are retained.
- **Env docs (Req 2.6, 6.5):** assert `.env.example` and `.env.prod.example` document `PG_HOST=postgres`, `PG_DB=shai_db`, `PG_USER=shai_user`, `PG_PORT`, `PG_PASSWORD`, `OVH_AI_ENDPOINT`, `OVH_AI_TOKEN`.
- **Config alignment (Req 2.1–2.5):** assert reconciled `Settings` defaults and that the host/db parsed from `DATABASE_URL` match `PG_HOST`/`PG_DB`.
- **Dependency (Req 4.3):** assert `pypdf` is declared in `requirements.txt`.
- **Entry point (Req 4.1, 4.8):** assert `scripts/ingest_embeddings.py` exists with a `__main__` guard and a `main()` callable.

### Integration (1–3 representative runs, not property-based)

- **Req 1.2, 1.3, 1.5:** against a live `pgvector/pgvector:pg15` container, confirm `shai_db` is reachable, `alembic upgrade head` succeeds, and `CREATE EXTENSION vector` / `vector` type work.

### Regression preservation (Req 7)

- Run `tests/test_opcp_companion_provider.py` unchanged; all behavior tests remain green. Only the `PG_*` defaults-equality assertion is updated to the reconciled values, with no change to provider behavior.

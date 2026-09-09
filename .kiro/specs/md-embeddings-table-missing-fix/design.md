# md-embeddings-table-missing-fix Bugfix Design

## Overview

The Oracle "OPCP Companion" RAG provider runs a pgvector similarity search against a table named `md_embeddings` on a **separate** vector database (reached through the explicit `PG_*` settings, `PG_DB` defaulting to `vectordb`). Nothing in the codebase provisions that table or the `pgvector` extension: Alembic targets only `DATABASE_URL`, and startup document seeding only writes into the main-DB `Document` system. As a result, every OPCP Companion query fails with `relation "md_embeddings" does not exist`.

The fix provisions the vector store **idempotently and lazily**, inside the OPCP Companion provider, on the same `PG_*` connection it already opens, immediately before the similarity search runs. A single provisioning step ensures (a) the `pgvector` extension exists and (b) the `md_embeddings` table exists with the columns the search relies on (`title`, `file_path`, `chunk_index`, `content`, `embedding`). If provisioning cannot complete, the provider raises a clear, actionable error that names the missing table and the target vector database instead of surfacing an opaque runtime SQL error.

The fix is deliberately narrow. It touches only `OpcpCompanionProvider` in `app/oracle/ai_providers.py`. It does not modify Alembic, document seeding, application startup, or any other AI provider. Because provisioning is idempotent (`CREATE EXTENSION IF NOT EXISTS`, `CREATE TABLE IF NOT EXISTS`), it is safe to run on every query and a no-op once the store already exists — which makes the "table already exists" case behave exactly as it does today.

## Glossary

- **Bug_Condition (C)**: The condition that triggers the bug — an Oracle query with `ai_provider = "opcp_companion"` runs while the `md_embeddings` relation does not exist in the target vector database.
- **Property (P)**: The desired behavior for buggy inputs — after provisioning, the `md_embeddings` table (with the expected columns) exists and the similarity search executes without a `relation "md_embeddings" does not exist` error.
- **Preservation**: Existing behavior that must remain unchanged — all non-OPCP providers, existing Alembic migrations, existing document seeding, and OPCP queries against an already-provisioned table (connection, `TABLE_NAME`, cosine ordering, `top_k`).
- **`OpcpCompanionProvider._search`**: The method in `app/oracle/ai_providers.py` that issues the pgvector `SELECT ... FROM {self.table_name} ORDER BY embedding <=> %s::vector LIMIT %s` query.
- **`OpcpCompanionProvider._get_pg_connection`**: The method that opens a psycopg2 connection to the vector DB using `PG_HOST`, `PG_PORT`, `PG_DB`, `PG_USER`, `PG_PASSWORD`.
- **`ensure_vector_store` (new)**: The new idempotent provisioning method that creates the `pgvector` extension and the `md_embeddings` table if they are missing, on the provider's own connection.
- **`TABLE_NAME`**: The configured table name (`settings.TABLE_NAME`, default `md_embeddings`), the sole source of the table identifier — never user input.
- **`EMBEDDING_DIM`**: The configured embedding dimension (`settings.EMBEDDING_DIM`, default `4096`) used to declare the `embedding vector(N)` column type.
- **Vector DB**: The Postgres database identified by the `PG_*` settings, distinct from the application's main `DATABASE_URL`.

## Bug Details

### Bug Condition

The bug manifests when an Oracle query selects the OPCP Companion provider (`ai_provider = "opcp_companion"`) and the `md_embeddings` relation does not exist in the target vector database. `_search` interpolates `self.table_name` into the SQL and executes it; because the relation was never created (no Alembic migration and no seeding provisions the vector DB), Postgres raises `relation "md_embeddings" does not exist`, which the provider re-raises as a generic French vector-database failure.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type OracleQueryContext
  OUTPUT: boolean

  RETURN input.ai_provider = "opcp_companion"
         AND NOT tableExists(input.pg_connection, input.table_name)
         // table_name comes from settings.TABLE_NAME, default "md_embeddings"
END FUNCTION
```

### Examples

- **Fresh deployment, first OPCP query** — User submits any question with `ai_provider = "opcp_companion"` against a `vectordb` where nothing created `md_embeddings`. Expected: search runs and returns chunks (possibly empty). Actual: `relation "md_embeddings" does not exist`, query fails.
- **Migrations + seeding completed, OPCP query** — Logs show "Docs seeding complete", giving the impression the store is ready. Expected: OPCP search works. Actual: it still fails, because seeding only touched the main-DB `Document` system, not the vector DB.
- **Extension missing** — Even if a table were created, the `embedding <=> %s::vector` operator requires the `pgvector` extension. Expected: extension present so the cosine operator resolves. Actual (without the fix): extension/type absent, operator/type errors.
- **Edge case — table already exists (non-bug)** — `md_embeddings` was provisioned out-of-band by an operator. Expected: query works unchanged. Actual: already works today; the fix must not alter this.

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Non-OPCP providers (`kiro`, `shai`, `openai`) must continue to route and behave exactly as before — they never touch the vector DB or the new provisioning code.
- Existing Alembic migrations against the main `DATABASE_URL` (user, document, forum, payment, event migrations) must continue to apply unchanged.
- Startup document seeding (`seed_docs_folder`) must continue to seed repository docs into the main-DB `Document` system exactly as before.
- OPCP Companion queries against an already-provisioned `md_embeddings` table must continue to use the configured `PG_*` connection and `TABLE_NAME`, the cosine-distance ordering (`embedding <=> %s::vector`), and the `top_k` limit as currently implemented.
- The existing `_search`, `_chunks_to_sources`, `_build_context`, and `query` result-dict contracts (keys `answer`, `processing_time`, `tokens_used`, `provider`, `sources`) must remain unchanged.

**Scope:**
All inputs that do NOT satisfy the bug condition should be completely unaffected by this fix. This includes:
- Any query with a non-OPCP provider.
- Any OPCP query where `md_embeddings` already exists (provisioning becomes a no-op).
- All Alembic migration runs and all document-seeding runs.

**Note:** The expected *correct* behavior for buggy inputs is defined in the Correctness Properties section (Property 1). This section focuses on what must NOT change.

## Hypothesized Root Cause

The bug is a provisioning gap, confirmed during the requirements phase. The most likely contributing causes are:

1. **No provisioning path targets the vector DB**: Alembic (`migrations/env.py`) is wired to `DATABASE_URL` only. The vector DB reached via `PG_*` (default `vectordb`) is never a migration target, so no migration in `migrations/versions/` creates `md_embeddings` or the `pgvector` extension.
   - The `PG_*` connection in `_get_pg_connection` is independent of the SQLAlchemy engine used by migrations.
   - None of the current migrations reference embeddings or pgvector.

2. **Seeding provisions the wrong store**: `seed_docs_folder` writes into the main-DB `Document` system, not the vector DB. "Docs seeding complete" therefore does not imply the vector store exists.

3. **Missing `pgvector` extension**: Even with a table, the `embedding <=> %s::vector` operator and the `vector` type require `CREATE EXTENSION vector`, which is never run against the vector DB.

4. **Lazy connection has no bootstrap step**: `query` opens the connection and calls `_search` directly, with no "ensure schema exists" step in between, so a fresh vector DB always fails on the first search.

## Correctness Properties

Property 1: Bug Condition - Vector store is provisioned before search

_For any_ input where the bug condition holds (isBugCondition returns true — an OPCP Companion query while `md_embeddings` does not exist), the fixed provider SHALL first run an idempotent provisioning step that creates the `pgvector` extension and the `md_embeddings` table (columns `title`, `file_path`, `chunk_index`, `content`, `embedding`) on the `PG_*` vector-DB connection, so that after provisioning `tableExists(pg_connection, table_name)` is true and the similarity search executes without raising `relation "md_embeddings" does not exist`. If provisioning cannot complete, the provider SHALL raise a clear, actionable error naming the missing table and the target vector database.

**Validates: Requirements 2.1, 2.2, 2.3**

Property 2: Preservation - Non-buggy inputs behave identically

_For any_ input where the bug condition does NOT hold (isBugCondition returns false — a non-OPCP provider, or an OPCP query where `md_embeddings` already exists), the fixed code SHALL produce the same result as the original code, preserving provider routing, existing Alembic migrations, document seeding, and the OPCP search connection/`TABLE_NAME`/cosine-ordering/`top_k` behavior.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4**

## Fix Implementation

### Changes Required

Assuming the root-cause analysis is correct, the change is contained entirely within the OPCP Companion provider.

**File**: `app/oracle/ai_providers.py`

**Function**: `OpcpCompanionProvider` — add `ensure_vector_store` and call it from `query` before `_search`.

**Specific Changes**:

1. **Add an idempotent `ensure_vector_store(conn)` method**: Given an open psycopg2 connection to the vector DB, run provisioning DDL that is safe to execute repeatedly:
   - `CREATE EXTENSION IF NOT EXISTS vector;`
   - `CREATE TABLE IF NOT EXISTS {self.table_name} (...)` declaring the columns the search reads: `title text`, `file_path text`, `chunk_index integer`, `content text`, and `embedding vector({self.embedding_dim})`. `self.table_name` and `self.embedding_dim` come from configuration only (never user input), matching the existing safe-interpolation pattern already used in `_search`.
   - `conn.commit()` so the DDL is durable before the search runs.

2. **Invoke provisioning before search in `query`**: In the pgvector step of `query`, after opening the connection with `_get_pg_connection` and before calling `_search`, call `ensure_vector_store` via `asyncio.to_thread` (consistent with the existing off-loop pattern for blocking psycopg2 calls). Both provisioning and search share the same connection and the same `try/except/finally` that closes the connection.

3. **Actionable error on provisioning failure (Req 2.3)**: Wrap provisioning so that a failure raises a clear French message that names the target table (`self.table_name`) and the vector database (`settings.PG_DB` on `settings.PG_HOST:settings.PG_PORT`), e.g. an inability to provision `md_embeddings` on database `vectordb`. Do not leak credentials (`PG_PASSWORD`). This preserves the existing "descriptive DB error" contract already asserted by the tests.

4. **Keep the existing search path unchanged**: `_search` keeps its current SQL, cosine ordering, and `top_k` limit. When the table already exists, `ensure_vector_store` is a no-op and the search behaves exactly as before.

5. **No changes elsewhere**: Alembic (`migrations/env.py`, `migrations/versions/*`), `seed_docs_folder`, `app/main.py` startup/lifespan, `app/config.py`, and the other providers are untouched.

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bug on unfixed code, then verify the fix works correctly and preserves existing behavior. New tests extend the existing suite in `tests/test_opcp_companion_provider.py`, reusing its `_FakeConn`/`_FakeCursor` doubles and monkeypatch wiring patterns so the vector DB is never required in CI.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing the fix. Confirm or refute the root-cause analysis. If refuted, re-hypothesize.

**Test Plan**: Simulate a vector DB where `md_embeddings` is missing. Model the missing relation with a fake cursor whose `execute` raises the equivalent of `relation "md_embeddings" does not exist` on the `SELECT`, and assert that (on unfixed code) `query` surfaces the vector-database failure. Then observe that unfixed `query` never issues any provisioning DDL.

**Test Cases**:
1. **Missing-table search fails**: With a connection whose `SELECT` raises `relation "md_embeddings" does not exist`, `query` raises the vector-DB error (will fail to be prevented on unfixed code).
2. **No provisioning on unfixed code**: Assert unfixed `query` issues no `CREATE EXTENSION` / `CREATE TABLE` statement — confirming the provisioning gap (will fail after the fix is added, i.e. demonstrates the gap exists now).
3. **Extension-dependent operator**: A fresh DB without `pgvector` cannot resolve `<=> ... ::vector` — documents that both extension and table are required (will fail on unfixed code).
4. **Edge — already-provisioned DB**: With a connection where the table exists, unfixed `query` already succeeds (baseline for preservation).

**Expected Counterexamples**:
- The similarity search raises `relation "md_embeddings" does not exist`.
- No provisioning DDL is ever executed against the vector DB.
- Possible causes: no vector-DB migration target, seeding targets the wrong store, missing `pgvector` extension.

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed provider provisions the store and the search no longer fails with "relation does not exist".

**Pseudocode:**
```
FOR ALL input WHERE isBugCondition(input) DO
  conn := getPgConnection(input)
  ensureVectorStore(conn, input.table_name, input.embedding_dim)   // idempotent
  result := fixedQuery(input)
  ASSERT tableExists(conn, input.table_name)
  ASSERT NOT raised(result, "relation \"md_embeddings\" does not exist")
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed provider produces the same result as the original.

**Pseudocode:**
```
FOR ALL input WHERE NOT isBugCondition(input) DO
  ASSERT originalBehavior(input) = fixedBehavior(input)
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many test cases automatically across the input domain.
- It catches edge cases that manual unit tests might miss.
- It provides strong guarantees that behavior is unchanged for all non-buggy inputs.

**Test Plan**: Reuse the existing `_FakeConn`-based property tests (`_search` row mapping, `_chunks_to_sources`, `_build_context`, the `query` dict contract). Confirm these still pass unchanged, and add a property asserting that when the table already exists, `ensure_vector_store` performs no destructive DDL and the search result equals the pre-fix result.

**Test Cases**:
1. **Non-OPCP providers unchanged**: Observe `kiro`/`shai`/`openai` routing and results on current code, then assert they are identical after the fix (no vector-DB access).
2. **Existing table → no-op provisioning**: With a connection reporting the table exists, assert `ensure_vector_store` issues only `IF NOT EXISTS` DDL and the returned chunks match the pre-fix output.
3. **Search contract preserved**: `_search` row mapping, `_chunks_to_sources`, and `_build_context` properties continue to hold across generated inputs.
4. **`query` dict contract preserved**: The result dict still contains `answer`, `processing_time`, `tokens_used`, `provider = "opcp_companion"`, and `sources`.

### Unit Tests

- `ensure_vector_store` issues `CREATE EXTENSION IF NOT EXISTS vector` and `CREATE TABLE IF NOT EXISTS {TABLE_NAME} (...)` with the five expected columns and `vector({EMBEDDING_DIM})`, then commits.
- `query` calls `ensure_vector_store` before `_search` on the same connection.
- Provisioning failure raises an actionable error naming `TABLE_NAME` and the vector DB (`PG_DB`) without leaking `PG_PASSWORD`.
- Existing token-guard and descriptive-error tests continue to pass (`OVH_AI_TOKEN`, `LLM_TOKEN`, connect failure, embedding failure, generation failure).

### Property-Based Tests

- Generate pgvector rows and verify `_search` mapping is unchanged after the fix (existing Property 1).
- Generate chunk lists and verify `_chunks_to_sources` / `_build_context` are unchanged (existing Properties 2, 4).
- Generate questions and verify the `query` dict contract holds with provisioning wired in (existing Property 3, extended so `_get_pg_connection` returns a fake conn that records provisioning DDL).
- Generate provider results and verify streaming `done`/`error` events are unchanged (existing Properties 5, 6).

### Integration Tests

- Full OPCP flow against a fake connection that starts without `md_embeddings`: provisioning runs, then search executes and the `done` event carries `sources` (no "relation does not exist").
- Full OPCP flow against a fake connection that already has the table: provisioning is a no-op and the flow matches the pre-fix result.
- Full flow with a non-OPCP provider: no provisioning DDL is issued and behavior is unchanged.

# Implementation Plan

- [x] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - Vector store missing before search
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate the bug exists
  - **Scoped PBT Approach**: This bug is deterministic. Scope the property to the concrete failing case: `ai_provider = "opcp_companion"` against a vector DB where `md_embeddings` does not exist. Parameterize over embedding vectors / `top_k` to keep it property-shaped while remaining reproducible.
  - In `tests/test_opcp_companion_provider.py`, reuse the existing `_FakeConn`/`_FakeCursor` doubles. Extend `_FakeCursor` (or add a variant) so `execute` on the `SELECT ... FROM md_embeddings ...` raises the equivalent of `relation "md_embeddings" does not exist`, and so it records every SQL statement executed (to detect provisioning DDL).
  - Bug Condition (from design): `isBugCondition(input)` = `input.ai_provider == "opcp_companion" AND NOT tableExists(input.pg_connection, input.table_name)` where `table_name` comes from `settings.TABLE_NAME` (default `md_embeddings`).
  - Test assertion should match the Expected Behavior (from design Property 1): after provisioning, `tableExists(conn, table_name)` is true and the similarity search runs without raising `relation "md_embeddings" does not exist`.
  - Concretely, patch `_get_pg_connection` to return the missing-table `_FakeConn`, then assert `query`/`_search` for an OPCP query does NOT surface `relation "md_embeddings" does not exist`, AND assert the connection received `CREATE EXTENSION IF NOT EXISTS vector` and `CREATE TABLE IF NOT EXISTS md_embeddings (...)` before the `SELECT`.
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS (this is correct - it proves the bug exists: no provisioning DDL is issued and the missing-table `SELECT` error is surfaced)
  - Document counterexamples found to understand root cause (e.g. "OPCP query against a vector DB without `md_embeddings` raises `relation \"md_embeddings\" does not exist`; unfixed `query` issues no `CREATE EXTENSION`/`CREATE TABLE` DDL")
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 1.1, 1.2, 1.3, 2.1, 2.2, 2.3_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Non-buggy inputs behave identically
  - **IMPORTANT**: Follow observation-first methodology - record actual outputs on UNFIXED code, then assert them
  - Non-bug condition (from design): `isBugCondition(input)` returns false — a non-OPCP provider (`kiro`, `shai`, `openai`), OR an OPCP query where `md_embeddings` already exists.
  - Observe on UNFIXED code and capture as property-based tests (reuse the existing `_FakeConn`/`_FakeCursor` doubles and the existing `hypothesis` strategies `_row_strategy`, `_chunk_strategy`, `_source_strategy`):
    - Observe: non-OPCP providers (`kiro`/`shai`/`openai`) route and return results without any vector-DB access — assert this is unchanged (no provisioning DDL issued).
    - Observe: `_search` maps pgvector rows `(title, file_path, chunk_index, content, similarity)` to chunk dicts across generated rows (existing Property 1) — assert unchanged.
    - Observe: `_chunks_to_sources` and `_build_context` outputs across generated chunk lists (existing Properties 2, 4) — assert unchanged.
    - Observe: the `query` result dict contract — keys `answer`, `processing_time`, `tokens_used`, `provider == "opcp_companion"`, `sources` (existing Property 3) — assert unchanged.
    - Observe: for an already-provisioned table (`_FakeConn` reporting the table exists), `ensure_vector_store` performs only `IF NOT EXISTS` DDL (no destructive statements) and the returned chunks equal the pre-fix output.
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (this confirms the baseline behavior to preserve). Note the already-provisioned `ensure_vector_store` assertion is written now but exercised fully after task 3.
  - Mark task complete when tests are written, run, and passing on unfixed code (for the parts that reference existing behavior)
  - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [x] 3. Fix for missing `md_embeddings` vector store (idempotent lazy provisioning)

  - [x] 3.1 Implement the fix
    - In `app/oracle/ai_providers.py`, add an idempotent `ensure_vector_store(conn)` method to `OpcpCompanionProvider` that, on an open psycopg2 vector-DB connection:
      - executes `CREATE EXTENSION IF NOT EXISTS vector;`
      - executes `CREATE TABLE IF NOT EXISTS {self.table_name} (title text, file_path text, chunk_index integer, content text, embedding vector({self.embedding_dim}))` — using `self.table_name` (from `settings.TABLE_NAME`) and `self.embedding_dim` (from `settings.EMBEDDING_DIM`) via the existing config-only safe-interpolation pattern (never user input)
      - calls `conn.commit()` so the DDL is durable before the search runs
    - In `query`, in the pgvector step, after opening the connection with `_get_pg_connection` and before calling `_search`, invoke `ensure_vector_store` via `asyncio.to_thread` (consistent with the existing off-loop pattern), sharing the same connection and the same `try/except/finally` that closes it.
    - Wrap provisioning so a failure raises a clear, actionable French error naming the target table (`self.table_name`) and the vector database (`settings.PG_DB` on `settings.PG_HOST:settings.PG_PORT`) without leaking `PG_PASSWORD`.
    - Keep `_search` unchanged (same SQL, cosine ordering `embedding <=> %s::vector`, `top_k` limit). When the table already exists, `ensure_vector_store` is a no-op.
    - Make NO changes to Alembic (`migrations/env.py`, `migrations/versions/*`), `seed_docs_folder`, `app/main.py`, `app/config.py`, or other providers.
    - _Bug_Condition: isBugCondition(input) = input.ai_provider == "opcp_companion" AND NOT tableExists(input.pg_connection, input.table_name) (from design)_
    - _Expected_Behavior: ensureVectorStore'(conn, table_name) then search runs; ASSERT tableExists(conn, table_name) AND NOT raised(result, "relation \"md_embeddings\" does not exist") (from design Property 1)_
    - _Preservation: Non-OPCP routing, Alembic migrations, document seeding, and OPCP connection/TABLE_NAME/cosine-ordering/top_k unchanged (from design Preservation Requirements)_
    - _Requirements: 2.1, 2.2, 2.3_

  - [x] 3.2 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - Vector store is provisioned before search
    - **IMPORTANT**: Re-run the SAME test from task 1 - do NOT write a new test
    - The test from task 1 encodes the expected behavior; when it passes it confirms the expected behavior is satisfied
    - Run the bug condition exploration test from step 1
    - **EXPECTED OUTCOME**: Test PASSES — `CREATE EXTENSION IF NOT EXISTS vector` and `CREATE TABLE IF NOT EXISTS md_embeddings (...)` are issued and committed before the `SELECT`, and no `relation "md_embeddings" does not exist` error is surfaced
    - _Requirements: 2.1, 2.2, 2.3_

  - [x] 3.3 Verify preservation tests still pass
    - **Property 2: Preservation** - Non-buggy inputs behave identically
    - **IMPORTANT**: Re-run the SAME tests from task 2 - do NOT write new tests
    - Run the preservation property tests from step 2
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions) — non-OPCP routing, `_search` mapping, `_chunks_to_sources`, `_build_context`, and the `query` dict contract are unchanged; already-provisioned `ensure_vector_store` performs only `IF NOT EXISTS` DDL and returns the pre-fix output
    - Confirm all tests still pass after the fix (no regressions), including existing token-guard and descriptive-error tests (`OVH_AI_TOKEN`, `LLM_TOKEN`, connect failure, embedding failure, generation failure)
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [x] 4. Checkpoint - Ensure all tests pass
  - Run the full `tests/test_opcp_companion_provider.py` suite (and the broader suite if quick) and ensure every test passes.
  - Confirm the bug condition exploration test (task 1) now passes and all preservation tests (task 2) still pass.
  - Ask the user if questions arise.

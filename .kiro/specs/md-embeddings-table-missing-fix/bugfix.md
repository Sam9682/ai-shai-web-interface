# Bugfix Requirements Document

## Introduction

The Oracle "OPCP Companion" RAG provider performs a pgvector similarity search against a Postgres table named `md_embeddings`. At runtime the query fails because the relation does not exist:

```
OPCP Companion pgvector search failed: relation "md_embeddings" does not exist
LINE 1: ...0.01844674162566662]'::vector) AS similarity FROM md_embeddi...
Oracle stream query failed: Échec de la connexion ou de la recherche dans la base
de données vectorielle (relation "md_embeddings" does not exist)
```

Investigation confirms the root cause: nothing in the codebase ever creates the `md_embeddings` table (or the `pgvector` extension) in the vector database that the provider connects to.

Key facts established during investigation:

- The provider (`app/oracle/ai_providers.py`, `OpcpCompanionProvider._search`) runs
  `SELECT title, file_path, chunk_index, content, 1 - (embedding <=> %s::vector) AS similarity FROM {TABLE_NAME} ORDER BY embedding <=> %s::vector LIMIT %s;`
  where `TABLE_NAME` defaults to `md_embeddings`.
- The provider connects to a **separate** database via the explicit `PG_*` settings
  (`PG_HOST`, `PG_PORT`, `PG_DB` default `vectordb`, `PG_USER`, `PG_PASSWORD`) — see
  `OpcpCompanionProvider._get_pg_connection` and `app/config.py`. This connection is
  distinct from the application's main `DATABASE_URL`.
- Alembic (`migrations/env.py`) is configured against `DATABASE_URL` only. It never
  targets the `PG_*` / `vectordb` connection, so no existing or future Alembic migration
  in `migrations/versions/` creates `md_embeddings`. None of the current migrations
  reference embeddings or pgvector.
- Startup document seeding (`app/services/document_seed_service.py`, `seed_docs_folder`)
  writes into the application `Document` system on the main DB. It does **not** create or
  populate `md_embeddings` in the vector DB, so "Docs seeding complete" gives a false
  impression that the vector store is ready.

Net effect: whenever the OPCP Companion provider is selected, the similarity search
targets a table that was never provisioned, and the Oracle stream query fails.

**Impact:** The OPCP Companion RAG feature is completely non-functional; every query
selecting this provider returns a vector-database error to the user.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN a user submits an Oracle query with `ai_provider = "opcp_companion"` and the `md_embeddings` relation does not exist in the vector database THEN the system raises `relation "md_embeddings" does not exist` and the query fails
1.2 WHEN the OPCP Companion pgvector search runs against a vector database where the target table is missing THEN the system logs `OPCP Companion pgvector search failed: relation "md_embeddings" does not exist` and surfaces a generic vector-database failure to the caller
1.3 WHEN the application starts up (migrations run and document seeding completes) THEN the system does NOT provision the `md_embeddings` table or the `pgvector` extension in the vector database, leaving the RAG store absent

### Expected Behavior (Correct)

2.1 WHEN a user submits an Oracle query with `ai_provider = "opcp_companion"` and the vector store has been provisioned THEN the system SHALL execute the similarity search against an existing `md_embeddings` table (matching `TABLE_NAME`) with the expected columns (`title`, `file_path`, `chunk_index`, `content`, `embedding`) and return results without a "relation does not exist" error
2.2 WHEN the OPCP Companion pgvector search runs THEN the system SHALL query a table that has been provisioned by a repeatable, idempotent mechanism (including the `pgvector` extension) so that the `md_embeddings` relation is guaranteed to exist before the query executes
2.3 WHEN the vector store cannot be provisioned or the table is genuinely absent for reasons outside the fix's control THEN the system SHALL fail with a clear, actionable message (identifying the missing table and the target vector database) rather than an opaque runtime SQL error

### Unchanged Behavior (Regression Prevention)

3.1 WHEN a user submits an Oracle query with a non-OPCP provider (`kiro`, `shai`, or `openai`) THEN the system SHALL CONTINUE TO route to that provider unaffected by the vector-store provisioning change
3.2 WHEN Alembic migrations run against the application's main `DATABASE_URL` THEN the system SHALL CONTINUE TO apply the existing user/document/forum/payment/event migrations unchanged
3.3 WHEN startup document seeding runs (`seed_docs_folder`) THEN the system SHALL CONTINUE TO seed repository docs into the application `Document` system exactly as before
3.4 WHEN the OPCP Companion query executes against a correctly provisioned `md_embeddings` table THEN the system SHALL CONTINUE TO use the configured `PG_*` connection and `TABLE_NAME`, the cosine-distance ordering (`embedding <=> %s::vector`), and the `top_k` limit as currently implemented

## Bug Condition and Properties

### Bug Condition

```pascal
FUNCTION isBugCondition(X)
  INPUT: X of type OracleQueryContext
  OUTPUT: boolean

  // Bug triggers when the OPCP Companion provider is used and the
  // md_embeddings relation does not exist in the target vector database.
  RETURN X.ai_provider = "opcp_companion"
         AND NOT tableExists(X.pg_connection, X.table_name)   // table_name defaults to "md_embeddings"
END FUNCTION
```

### Property: Fix Checking

```pascal
// For every buggy input, after the fix the vector store is provisioned
// and the similarity search does not fail with "relation does not exist".
FOR ALL X WHERE isBugCondition(X) DO
  ensureVectorStore'(X.pg_connection, X.table_name)   // idempotent: create extension + table if missing
  result ← opcpCompanionSearch'(X)
  ASSERT tableExists(X.pg_connection, X.table_name)
  ASSERT NOT raised(result, "relation \"md_embeddings\" does not exist")
END FOR
```

### Property: Preservation Checking

```pascal
// For every non-buggy input, the fixed system behaves identically to the original.
FOR ALL X WHERE NOT isBugCondition(X) DO
  ASSERT F(X) = F'(X)
END FOR
```

Where **F** is the current (unfixed) behavior and **F'** is the behavior after the fix.
Non-buggy inputs include all non-OPCP providers and OPCP queries where `md_embeddings`
already exists.

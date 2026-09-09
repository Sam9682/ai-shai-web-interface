"""Tests for the OPCP Companion RAG provider.

Feature: opcp-companion-provider

Covers optional test tasks:
- 1.4  config/dependency smoke tests
- 2.2  schema example tests
- 3.3  Property 1 (pgvector row mapping preserves chunk fields)
- 3.4  Property 4 (sources derive faithfully from chunks)
- 3.6  Property 2 (assembled context contains each chunk)
- 4.3  Property 3 (provider query dict contract)
- 4.4  provider wiring / edge / smoke tests
- 6.2  Property 5 (done event propagates provider sources)
- 6.3  Property 6 (provider error during streaming -> error event, no done)
- 6.6  service/router/config wiring tests
"""
import asyncio
import json
import re
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest
from hypothesis import HealthCheck, given, settings, strategies as st
from pydantic import ValidationError

from app.config import Settings
from app.oracle.ai_providers import OpcpCompanionProvider, get_ai_provider
from app.oracle.schemas import OracleQuery, OracleResponse, Source


REPO_ROOT = Path(__file__).resolve().parents[1]


# ---------------------------------------------------------------------------
# Hypothesis strategies
# ---------------------------------------------------------------------------

_text = st.text(min_size=0, max_size=40)
_distance = st.floats(min_value=0.0, max_value=2.0, allow_nan=False, allow_infinity=False)


def _row_strategy():
    """A pgvector row: (title, file_path, chunk_index, content, similarity)."""
    return st.tuples(
        _text,                                       # title
        _text,                                       # file_path
        st.integers(min_value=0, max_value=10_000),  # chunk_index
        _text,                                       # content
        _distance,                                   # similarity (already 1 - distance)
    )


def _chunk_strategy():
    return st.fixed_dictionaries({
        "title": _text,
        "file_path": _text,
        "chunk_index": st.integers(min_value=0, max_value=10_000),
        "content": _text,
        "similarity": st.floats(
            min_value=0.0, max_value=1.0, allow_nan=False, allow_infinity=False
        ),
    })


def _source_strategy():
    return st.fixed_dictionaries({
        "title": _text,
        "file_path": _text,
        "similarity": st.floats(
            min_value=0.0, max_value=1.0, allow_nan=False, allow_infinity=False
        ),
    })


# ===========================================================================
# Task 1.4 — config / dependency smoke tests (Req 4.2, 4.4, 6.1, 6.2)
# ===========================================================================

class TestConfigAndDependenciesSmoke:
    def test_settings_defaults_match_rag_query(self):
        """Settings() with no env overrides yields rag_query.py defaults."""
        s = Settings()
        assert s.EMBEDDING_MODEL == "Qwen3-Embedding-8B"
        assert s.EMBEDDING_DIM == 4096
        assert s.LLM_MODEL == "Qwen3-Embedding-8B"
        assert s.PG_HOST == "localhost"
        assert s.PG_PORT == 5432
        assert s.PG_DB == "vectordb"
        assert s.PG_USER == "postgres"
        assert s.TABLE_NAME == "md_embeddings"

    def test_env_example_documents_each_rag_var(self):
        env_text = (REPO_ROOT / ".env.example").read_text(encoding="utf-8")
        for var in (
            "OVH_AI_ENDPOINT", "OVH_AI_TOKEN", "EMBEDDING_MODEL", "EMBEDDING_DIM",
            "LLM_ENDPOINT", "LLM_TOKEN", "LLM_MODEL",
            "PG_HOST", "PG_PORT", "PG_DB", "PG_USER", "PG_PASSWORD", "TABLE_NAME",
        ):
            assert re.search(rf"^{var}=", env_text, re.MULTILINE), (
                f"{var} not documented in .env.example"
            )

    def test_requirements_declares_psycopg2_and_openai(self):
        req = (REPO_ROOT / "requirements.txt").read_text(encoding="utf-8")
        assert re.search(r"^psycopg2-binary", req, re.MULTILINE)
        assert re.search(r"^openai", req, re.MULTILINE)


# ===========================================================================
# Task 2.2 — schema example tests (Req 1.4, 3.1)
# ===========================================================================

class TestSchemas:
    def test_oracle_query_accepts_opcp_companion(self):
        q = OracleQuery(question="Bonjour", ai_provider="opcp_companion")
        assert q.ai_provider == "opcp_companion"

    def test_oracle_query_rejects_unknown_provider(self):
        with pytest.raises(ValidationError):
            OracleQuery(question="Bonjour", ai_provider="totally_unknown")

    def test_oracle_response_accepts_sources_none(self):
        resp = OracleResponse(
            id=1, question="q", answer="a", ai_provider="opcp_companion",
            context=None, created_at="2024-01-01T00:00:00", user_id=None,
            processing_time=0.1, tokens_used=5, sources=None,
        )
        assert resp.sources is None

    def test_oracle_response_accepts_list_of_source(self):
        resp = OracleResponse(
            id=1, question="q", answer="a", ai_provider="opcp_companion",
            context=None, created_at="2024-01-01T00:00:00", user_id=None,
            processing_time=0.1, tokens_used=5,
            sources=[Source(title="t", file_path="f", similarity=0.9)],
        )
        assert len(resp.sources) == 1
        assert resp.sources[0].title == "t"


# ===========================================================================
# Task 3.3 — Property 1: pgvector row mapping preserves chunk fields
# Validates: Requirements 2.2, 2.3
# ===========================================================================

class _FakeCursor:
    def __init__(self, rows):
        self._rows = rows

    def execute(self, *args, **kwargs):
        return None

    def fetchall(self):
        return self._rows

    def close(self):
        return None


class _FakeConn:
    def __init__(self, rows):
        self._rows = rows

    def cursor(self):
        return _FakeCursor(self._rows)

    def close(self):
        return None


@settings(max_examples=150, deadline=None)
@given(rows=st.lists(_row_strategy(), min_size=0, max_size=8))
def test_property1_pgvector_row_mapping_preserves_fields(rows):
    """Feature: opcp-companion-provider, Property 1: Le mapping des lignes
    pgvector préserve les champs du chunk.

    Validates: Requirements 2.2, 2.3
    """
    provider = OpcpCompanionProvider()
    conn = _FakeConn(rows)
    chunks = provider._search(conn, [0.1, 0.2, 0.3], top_k=len(rows) or 1)

    assert len(chunks) == len(rows)
    for chunk, row in zip(chunks, rows):
        title, file_path, chunk_index, content, sim = row
        assert set(chunk.keys()) == {
            "title", "file_path", "chunk_index", "content", "similarity"
        }
        assert chunk["title"] == title
        assert chunk["file_path"] == file_path
        assert chunk["chunk_index"] == chunk_index
        assert chunk["content"] == content
        assert chunk["similarity"] == round(float(sim), 4)


# ===========================================================================
# Task 3.4 — Property 4: sources derive faithfully from chunks
# Validates: Requirements 2.6, 3.1
# ===========================================================================

@settings(max_examples=150, deadline=None)
@given(chunks=st.lists(_chunk_strategy(), min_size=0, max_size=8))
def test_property4_sources_derive_from_chunks(chunks):
    """Feature: opcp-companion-provider, Property 4: Les sources dérivent
    fidèlement des chunks.

    Validates: Requirements 2.6, 3.1
    """
    provider = OpcpCompanionProvider()
    sources = provider._chunks_to_sources(chunks)

    assert len(sources) == len(chunks)
    for source, chunk in zip(sources, chunks):
        assert source["title"] == chunk["title"]
        assert source["file_path"] == chunk["file_path"]
        assert source["similarity"] == chunk["similarity"]


# ===========================================================================
# Task 3.6 — Property 2: assembled context contains each chunk
# Validates: Requirements 2.4
# ===========================================================================

@settings(max_examples=150, deadline=None)
@given(chunks=st.lists(_chunk_strategy(), min_size=0, max_size=6))
def test_property2_build_context_contains_each_chunk(chunks):
    """Feature: opcp-companion-provider, Property 2: Le contexte assemblé
    contient chaque chunk récupéré.

    Validates: Requirements 2.4
    """
    provider = OpcpCompanionProvider()
    context = provider._build_context(chunks)

    for chunk in chunks:
        assert chunk["title"] in context
        assert str(chunk["chunk_index"]) in context
        assert chunk["content"] in context


# ===========================================================================
# Task 4.3 — Property 3: provider query dict contract
# Validates: Requirements 2.5
# ===========================================================================

@settings(
    max_examples=100,
    deadline=None,
    suppress_health_check=[HealthCheck.function_scoped_fixture],
)
@given(question=st.text(min_size=1, max_size=60))
def test_property3_query_dict_contract(question, monkeypatch):
    """Feature: opcp-companion-provider, Property 3: La réponse du fournisseur
    respecte le contrat de dictionnaire.

    Validates: Requirements 2.5
    """
    from app.config import settings as app_settings
    monkeypatch.setattr(app_settings, "OVH_AI_TOKEN", "tok-embed", raising=False)
    monkeypatch.setattr(app_settings, "LLM_TOKEN", "tok-llm", raising=False)

    provider = OpcpCompanionProvider()
    provider.embed_token = "tok-embed"
    provider.llm_token = "tok-llm"

    # Fake embedding client: embeddings.create -> vector of EMBEDDING_DIM floats.
    embed_client = MagicMock()
    embed_client.embeddings.create.return_value = SimpleNamespace(
        data=[SimpleNamespace(embedding=[0.0] * provider.embedding_dim)]
    )

    # Fake LLM client: responses.create -> output_text + usage.
    llm_client = MagicMock()
    llm_client.responses.create.return_value = SimpleNamespace(
        output_text="Réponse simulée.",
        usage=SimpleNamespace(total_tokens=42),
    )

    fake_conn = _FakeConn([
        ("Titre", "chemin.md", 0, "contenu", 0.9),
    ])

    monkeypatch.setattr(provider, "_get_embed_client", lambda: embed_client)
    monkeypatch.setattr(provider, "_get_llm_client", lambda: llm_client)
    monkeypatch.setattr(provider, "_get_pg_connection", lambda: fake_conn)

    result = asyncio.run(provider.query(question))

    assert set(["answer", "processing_time", "tokens_used", "provider", "sources"]).issubset(
        result.keys()
    )
    assert result["provider"] == "opcp_companion"
    assert result["processing_time"] >= 0


# ===========================================================================
# Task 4.4 — provider wiring / edge / smoke tests
# ===========================================================================

class TestProviderWiring:
    def test_factory_returns_opcp_companion_instance(self):
        """Req 1.1, 1.2"""
        provider = get_ai_provider("opcp_companion")
        assert isinstance(provider, OpcpCompanionProvider)

    def test_client_and_pg_wiring_uses_settings(self):
        """Req 4.5, 4.6, 2.1: base_url/api_key for embed vs llm; PG_* for conn."""
        import sys

        from app.config import settings as app_settings

        provider = OpcpCompanionProvider()
        provider.embed_endpoint = "https://embed.example/v1"
        provider.embed_token = "embed-token"
        provider.llm_endpoint = "https://llm.example/v1"
        provider.llm_token = "llm-token"

        # The provider imports `from openai import OpenAI` lazily. Inject a fake
        # `openai` module so the wiring can be asserted without the real package.
        mock_openai = MagicMock()
        fake_openai_module = SimpleNamespace(OpenAI=mock_openai)
        with patch.dict(sys.modules, {"openai": fake_openai_module}):
            provider._get_embed_client()
            mock_openai.assert_called_with(
                base_url="https://embed.example/v1", api_key="embed-token"
            )
            provider._get_llm_client()
            mock_openai.assert_called_with(
                base_url="https://llm.example/v1", api_key="llm-token"
            )

        with patch("psycopg2.connect") as mock_connect:
            provider._get_pg_connection()
            mock_connect.assert_called_once_with(
                host=app_settings.PG_HOST,
                port=app_settings.PG_PORT,
                dbname=app_settings.PG_DB,
                user=app_settings.PG_USER,
                password=app_settings.PG_PASSWORD,
            )

    def test_empty_ovh_token_raises_naming_var(self):
        """Req 5.3: empty OVH_AI_TOKEN -> error naming the variable."""
        provider = OpcpCompanionProvider()
        provider.embed_token = ""
        provider.llm_token = "llm-token"
        with pytest.raises(Exception) as exc:
            asyncio.run(provider.query("question"))
        assert "OVH_AI_TOKEN" in str(exc.value)

    def test_empty_llm_token_raises_naming_var(self):
        """Req 5.3: empty LLM_TOKEN -> error naming the variable."""
        provider = OpcpCompanionProvider()
        provider.embed_token = "embed-token"
        provider.llm_token = ""
        with pytest.raises(Exception) as exc:
            asyncio.run(provider.query("question"))
        assert "LLM_TOKEN" in str(exc.value)

    def test_pg_connect_failure_raises_descriptive_db_error(self):
        """Req 5.1: psycopg2.connect raising -> descriptive DB error."""
        provider = OpcpCompanionProvider()
        provider.embed_token = "embed-token"
        provider.llm_token = "llm-token"

        embed_client = MagicMock()
        embed_client.embeddings.create.return_value = SimpleNamespace(
            data=[SimpleNamespace(embedding=[0.0] * provider.embedding_dim)]
        )

        def _boom():
            raise Exception("connection refused")

        with patch.object(provider, "_get_embed_client", return_value=embed_client), \
             patch.object(provider, "_get_pg_connection", side_effect=_boom):
            with pytest.raises(Exception) as exc:
                asyncio.run(provider.query("question"))
        msg = str(exc.value).lower()
        assert "base de données" in msg or "connexion" in msg

    def test_embedding_failure_raises_descriptive_ovh_error(self):
        """Req 5.2: embeddings.create raising -> descriptive OVH error."""
        provider = OpcpCompanionProvider()
        provider.embed_token = "embed-token"
        provider.llm_token = "llm-token"

        embed_client = MagicMock()
        embed_client.embeddings.create.side_effect = Exception("ovh down")

        with patch.object(provider, "_get_embed_client", return_value=embed_client):
            with pytest.raises(Exception) as exc:
                asyncio.run(provider.query("question"))
        assert "OVH" in str(exc.value)

    def test_generation_failure_raises_descriptive_ovh_error(self):
        """Req 5.2: responses.create raising -> descriptive OVH error."""
        provider = OpcpCompanionProvider()
        provider.embed_token = "embed-token"
        provider.llm_token = "llm-token"

        embed_client = MagicMock()
        embed_client.embeddings.create.return_value = SimpleNamespace(
            data=[SimpleNamespace(embedding=[0.0] * provider.embedding_dim)]
        )
        llm_client = MagicMock()
        llm_client.responses.create.side_effect = Exception("ovh gen down")
        fake_conn = _FakeConn([("t", "f", 0, "c", 0.9)])

        with patch.object(provider, "_get_embed_client", return_value=embed_client), \
             patch.object(provider, "_get_llm_client", return_value=llm_client), \
             patch.object(provider, "_get_pg_connection", return_value=fake_conn):
            with pytest.raises(Exception) as exc:
                asyncio.run(provider.query("question"))
        assert "OVH" in str(exc.value)

    def test_no_import_of_opcp_ai_chatbot(self):
        """Req 6.4: ai_providers.py must not import the neighbour repo.

        The module docstring may legitimately name the source repo in prose, so
        we assert there is no *import statement* referencing it rather than a
        bare substring check.
        """
        src = (REPO_ROOT / "app" / "oracle" / "ai_providers.py").read_text(encoding="utf-8")
        import_lines = [
            line for line in src.splitlines()
            if re.match(r"\s*(import|from)\s", line)
        ]
        for line in import_lines:
            assert "opcp_ai_chatbot" not in line
            assert "opcp-ai-chatbot" not in line
            assert "rag_query" not in line


# ===========================================================================
# Task 6.2 — Property 5: done event propagates provider sources
# Validates: Requirements 3.2
# ===========================================================================

def _make_fake_db():
    db = MagicMock()

    def _refresh(obj):
        # Simulate the DB assigning a primary key on refresh.
        obj.id = 1

    db.refresh.side_effect = _refresh
    return db


def _drain_stream(stream):
    async def _collect():
        events = []
        async for event in stream:
            events.append(event)
        return events

    return asyncio.run(_collect())


@settings(
    max_examples=100,
    deadline=None,
    suppress_health_check=[HealthCheck.function_scoped_fixture],
)
@given(sources=st.lists(_source_strategy(), min_size=0, max_size=6))
def test_property5_done_event_propagates_sources(sources, monkeypatch):
    """Feature: opcp-companion-provider, Property 5: L'évènement `done` propage
    les sources du fournisseur.

    Validates: Requirements 3.2
    """
    from app.oracle import service as service_module
    from app.oracle.service import OracleService

    class _StubProvider:
        async def query(self, question, context=None, temperature=0.7, max_tokens=2000):
            return {
                "answer": "réponse",
                "processing_time": 0.01,
                "tokens_used": 3,
                "provider": "opcp_companion",
                "sources": sources,
            }

    monkeypatch.setattr(
        service_module, "get_ai_provider", lambda name: _StubProvider()
    )

    query = OracleQuery(question="q", ai_provider="opcp_companion")
    db = _make_fake_db()

    events = _drain_stream(OracleService.ask_oracle_stream(db, query, user_id=None))
    done_events = [e for e in events if e["type"] == "done"]
    assert len(done_events) == 1
    assert done_events[0]["sources"] == sources


# ===========================================================================
# Task 6.3 — Property 6: provider error -> error event, no done
# Validates: Requirements 5.4
# ===========================================================================

@settings(
    max_examples=100,
    deadline=None,
    suppress_health_check=[HealthCheck.function_scoped_fixture],
)
@given(msg=st.text(min_size=1, max_size=60))
def test_property6_error_event_on_provider_exception(msg, monkeypatch):
    """Feature: opcp-companion-provider, Property 6: Une erreur de fournisseur
    pendant le streaming produit un évènement `error`.

    Validates: Requirements 5.4
    """
    from app.oracle import service as service_module
    from app.oracle.service import OracleService

    class _RaisingProvider:
        async def query(self, question, context=None, temperature=0.7, max_tokens=2000):
            raise Exception(msg)

    monkeypatch.setattr(
        service_module, "get_ai_provider", lambda name: _RaisingProvider()
    )

    query = OracleQuery(question="q", ai_provider="opcp_companion")
    db = _make_fake_db()

    events = _drain_stream(OracleService.ask_oracle_stream(db, query, user_id=None))
    error_events = [e for e in events if e["type"] == "error"]
    done_events = [e for e in events if e["type"] == "done"]
    assert len(error_events) == 1
    assert msg in error_events[0]["message"]
    assert len(done_events) == 0


# ===========================================================================
# Task 6.6 — service / router / config wiring (Req 1.3, 1.6)
# ===========================================================================

class TestProvidersWiring:
    def test_providers_endpoint_includes_opcp_companion(self, client):
        """Req 1.6"""
        resp = client.get("/api/oracle/providers")
        assert resp.status_code == 200
        providers = resp.json()["providers"]
        assert any(p["id"] == "opcp_companion" for p in providers)

    def test_oracle_config_has_opcp_companion(self):
        """Req 1.3"""
        config = json.loads((REPO_ROOT / "oracle_config.json").read_text(encoding="utf-8"))
        assert "opcp_companion" in config["providers"]
        assert config["providers"]["opcp_companion"]["name"] == "OPCP Companion"

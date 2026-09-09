# Document de conception

## Aperçu

Cette conception ajoute le fournisseur d'IA **OPCP Companion** au module Oracle IA (`app/oracle`). OPCP Companion est un pipeline RAG (Retrieval-Augmented Generation) porté depuis `rag_query.py` du dépôt voisin `opcp-ai-chatbot`, réécrit sous forme d'une classe autonome `OpcpCompanionProvider` conforme à l'interface `AIProvider` existante. Le pipeline exécute trois étapes lors d'une requête :

1. **Embedding** de la question via les OVH AI Endpoints (client OpenAI).
2. **Récupération** des `k` meilleurs fragments (chunks) depuis une base Postgres pgvector existante, par recherche cosinus (`embedding <=> vector`).
3. **Génération** d'une réponse par un LLM OVH, avec les chunks récupérés comme contexte.

Le fournisseur retourne le dictionnaire standard `{answer, processing_time, tokens_used, provider}` attendu par `OracleService`, enrichi d'une liste `sources` (title, file_path, similarity). Ces sources sont propagées jusqu'au frontend, où elles s'affichent dans une section « Sources » repliable sous la réponse.

La logique RAG est **copiée (vendored)** dans l'application : aucune importation d'exécution du dépôt `opcp-ai-chatbot`. Le fournisseur lit toute sa configuration depuis `app.config.settings` (Pydantic Settings) plutôt que directement via `os.getenv`.

### Objectifs de conception

- S'intégrer sans friction aux patterns existants (`AIProvider`, `get_ai_provider`, `OracleService`, schémas Pydantic, SSE).
- Isoler les appels réseau (pgvector, OVH) derrière une gestion d'erreurs descriptive et journalisée.
- Threader les sources de bout en bout sans casser les fournisseurs existants (`kiro`, `shai`, `openai`) qui ne renvoient pas de sources.

### Corrections portées depuis `rag_query.py`

Le fichier source contient deux anomalies corrigées dans le portage :

- La table est lue via `os.getenv("TABLE_TABLE", ...)` (faute de frappe) ; la conception utilise la variable `TABLE_NAME`.
- `LLM_MODEL` prend par défaut un modèle d'embedding (`Qwen3-Embedding-8B`). Le défaut est conservé tel quel par fidélité au source, mais `.env.example` documentera qu'il convient de renseigner un modèle de chat.

## Architecture

```
Frontend (React / TypeScript)
  OraclePage.tsx / OracleWidget.tsx
        │  askOracleStream / askOracle
        ▼
  oracleService.ts  ── ai_provider: 'opcp_companion', OracleResponse.sources[], done.sources[]
        │  HTTP / SSE
        ▼
Backend (FastAPI)
  router.py  ──►  OracleService.ask_oracle / ask_oracle_stream
                         │
                         ▼
                  get_ai_provider("opcp_companion")
                         │
                         ▼
                  OpcpCompanionProvider.query(...)
                     1. embed_query   ──►  OVH AI Endpoint (OpenAI client, embeddings.create)
                     2. search        ──►  Postgres pgvector (psycopg2, embedding <=> vector)
                     3. generate      ──►  OVH LLM Endpoint (OpenAI client, responses.create)
                         │
                         ▼
                  { answer, processing_time, tokens_used, provider, sources[] }
```

### Flux SSE (streaming)

`OracleService.ask_oracle_stream` appelle `provider.query(...)` (le pipeline RAG produit la réponse en une seule fois), puis découpe la réponse en tokens pour l'UX mot-à-mot, comme les autres fournisseurs. L'évènement `done` transporte désormais `sources`. En cas d'exception, un évènement `error` porte le message.

## Composants et interfaces

### 1. `OpcpCompanionProvider` (backend — `app/oracle/ai_providers.py`)

Nouvelle classe conforme à `AIProvider`, entièrement autonome. Elle lit sa configuration depuis `settings`.

```python
class OpcpCompanionProvider(AIProvider):
    """Fournisseur RAG : embedding OVH + recherche pgvector + génération LLM OVH."""

    def __init__(self):
        self.embed_endpoint = settings.OVH_AI_ENDPOINT
        self.embed_token = settings.OVH_AI_TOKEN
        self.embedding_model = settings.EMBEDDING_MODEL
        self.embedding_dim = settings.EMBEDDING_DIM
        self.llm_endpoint = settings.LLM_ENDPOINT or settings.OVH_AI_ENDPOINT
        self.llm_token = settings.LLM_TOKEN or settings.OVH_AI_TOKEN
        self.llm_model = settings.LLM_MODEL
        self.table_name = settings.TABLE_NAME
        self.top_k = 3

    # --- Clients ---
    def _get_embed_client(self) -> "OpenAI": ...   # OpenAI(base_url=OVH_AI_ENDPOINT, api_key=OVH_AI_TOKEN)
    def _get_llm_client(self) -> "OpenAI": ...     # OpenAI(base_url=LLM_ENDPOINT, api_key=LLM_TOKEN)
    def _get_pg_connection(self): ...              # psycopg2.connect(host/port/dbname/user/password)

    # --- Étapes pures / semi-pures ---
    def _embed_query(self, client, query: str) -> list[float]: ...
    def _search(self, conn, query_vector: list[float], top_k: int) -> list[dict]: ...
    def _build_context(self, chunks: list[dict]) -> str: ...
    def _chunks_to_sources(self, chunks: list[dict]) -> list[dict]: ...

    async def query(self, question, context=None, temperature=0.7, max_tokens=2000) -> Dict[str, Any]: ...
```

Points clés :

- Les appels bloquants (`psycopg2`, client OpenAI synchrone) sont exécutés hors de la boucle événementielle via `await asyncio.to_thread(...)` pour ne pas bloquer FastAPI.
- **Garde de token** : au début de `query`, si `OVH_AI_TOKEN` (embedding) ou `LLM_TOKEN` (génération) est vide, lever une erreur nommant la variable manquante (Req 5.3).
- **Recherche pgvector** (portée depuis `rag_query.search`) :

```sql
SELECT title, file_path, chunk_index, content,
       1 - (embedding <=> %s::vector) AS similarity
FROM {TABLE_NAME}
ORDER BY embedding <=> %s::vector
LIMIT %s;
```

Le vecteur est sérialisé en `"[v1,v2,...]"`. `TABLE_NAME` provient de la configuration (jamais d'une entrée utilisateur), donc l'interpolation du nom de table est sûre ; les valeurs restent paramétrées (`%s`).

- **Mapping chunk** : chaque ligne devient `{"title", "file_path", "chunk_index", "content", "similarity"}` avec `similarity = round(float(1 - distance), 4)`.
- **Assemblage du contexte** : `"\n\n---\n\n".join(f"[{title} — chunk {idx}]\n{content}")`, injecté dans `instructions` (SYSTEM_PROMPT).
- **Génération** : `llm_client.responses.create(model=LLM_MODEL, instructions=..., input=question, store=False, max_output_tokens=max_tokens, temperature=temperature)` ; `answer = response.output_text.strip()`.
- **tokens_used** : lu depuis `response.usage.total_tokens` si disponible, sinon approximation `len(answer.split())`.
- **sources** : `[{"title", "file_path", "similarity"} for chunk in chunks]`.

Valeur de retour :

```python
{
    "answer": answer,
    "processing_time": time.time() - start_time,
    "tokens_used": tokens_used,
    "provider": "opcp_companion",
    "sources": sources,   # list[dict]
}
```

### 2. `get_ai_provider` (factory — `app/oracle/ai_providers.py`)

Ajout de l'entrée dans le dictionnaire :

```python
providers = {
    "kiro": KiroAIProvider,
    "shai": ShaiAIProvider,
    "openai": OpenAIProvider,
    "opcp_companion": OpcpCompanionProvider,   # nouveau
}
```

### 3. Configuration (`app/config.py`)

Extension de `Settings` avec les variables RAG et leurs valeurs par défaut issues de `rag_query.py` :

```python
# OPCP Companion (RAG) Configuration
OVH_AI_ENDPOINT: str = ""
OVH_AI_TOKEN: str = ""
EMBEDDING_MODEL: str = "Qwen3-Embedding-8B"
EMBEDDING_DIM: int = 4096
LLM_ENDPOINT: str = ""            # défaut runtime : retombe sur OVH_AI_ENDPOINT
LLM_TOKEN: str = ""               # défaut runtime : retombe sur OVH_AI_TOKEN
LLM_MODEL: str = "Qwen3-Embedding-8B"
PG_HOST: str = "localhost"
PG_PORT: int = 5432
PG_DB: str = "vectordb"
PG_USER: str = "postgres"
PG_PASSWORD: str = ""
TABLE_NAME: str = "md_embeddings"
```

La connexion Postgres utilise ces variables `PG_*` explicites, distinctes du `DATABASE_URL` de l'application principale (Req 4.3). `extra = "ignore"` est déjà configuré, donc aucune variable inconnue ne fait échouer le chargement.

### 4. Schémas (`app/oracle/schemas.py`)

Ajout d'un schéma `Source` et d'un champ optionnel `sources` sur `OracleResponse`. Le littéral `ai_provider` est étendu à `opcp_companion` sur `OracleQuery` (et `OracleAnalysisRequest` pour cohérence).

```python
class Source(BaseModel):
    title: str
    file_path: str
    similarity: float

class OracleQuery(BaseModel):
    ...
    ai_provider: Literal["kiro", "shai", "openai", "opcp_companion"] = Field(default="shai", ...)

class OracleResponse(BaseModel):
    ...
    tokens_used: Optional[int]
    sources: Optional[List[Source]] = None   # nouveau, optionnel
```

### 5. Service (`app/oracle/service.py`)

`ask_oracle` et `ask_oracle_stream` récupèrent `result.get("sources")` et le propagent :

- `ask_oracle` : passe `sources=result.get("sources")` à la construction de `OracleResponse`.
- `ask_oracle_stream` : ajoute `'sources': result.get("sources")` à la charge utile de l'évènement `done`. La branche `error` existante reste inchangée (elle porte déjà `message`, satisfaisant Req 5.4).

Les sources ne sont pas persistées dans `OracleQueryModel` (le modèle ne change pas) ; elles sont éphémères et servent l'affichage immédiat.

### 6. Router (`app/oracle/router.py`)

`GET /oracle/providers` ajoute l'entrée `opcp_companion` à la liste retournée (Req 1.6) :

```python
{
    "id": "opcp_companion",
    "name": "OPCP Companion",
    "description": "Assistant RAG basé sur la base documentaire OPCP (pgvector + OVH)",
    "default": False
}
```

### 7. Oracle_Config (`oracle_config.json`)

Ajout de l'entrée dans la section `providers` (Req 1.3) :

```json
"opcp_companion": {
  "name": "OPCP Companion",
  "type": "cloud",
  "rag": true,
  "requires_api_key": true,
  "env_var": "OVH_AI_TOKEN",
  "description": "Assistant RAG basé sur la base documentaire OPCP (pgvector + OVH AI Endpoints)"
}
```

### 8. `.env.example`

Nouvelle section documentant chaque variable RAG (Req 4.4) :

```bash
# OPCP Companion (RAG) Configuration
# OVH_AI_ENDPOINT=https://oai.endpoints.kepler.ai.cloud.ovh.net/v1
# OVH_AI_TOKEN=your_ovh_ai_token_here
# EMBEDDING_MODEL=Qwen3-Embedding-8B
# EMBEDDING_DIM=4096
# LLM_ENDPOINT=            # laisser vide pour réutiliser OVH_AI_ENDPOINT
# LLM_TOKEN=               # laisser vide pour réutiliser OVH_AI_TOKEN
# LLM_MODEL=               # renseigner un modèle de chat OVH (ex. Mixtral-8x7B-Instruct)
# PG_HOST=localhost
# PG_PORT=5432
# PG_DB=vectordb
# PG_USER=postgres
# PG_PASSWORD=your_pg_password_here
# TABLE_NAME=md_embeddings
```

### 9. Dépendances (`requirements.txt`)

- `psycopg2-binary==2.9.10` : **déjà présent** (aucun ajout).
- `openai` : **à ajouter** (client pour embeddings et génération via OVH). Version épinglée (ex. `openai==1.55.3`).

### 10. Frontend

**`frontend/src/services/oracleService.ts`**

```typescript
interface Source {
  title: string;
  file_path: string;
  similarity: number;
}

interface OracleQuery {
  ...
  ai_provider?: 'shai' | 'kiro' | 'openai' | 'opcp_companion';   // union étendue
}

interface OracleResponse {
  ...
  tokens_used?: number;
  sources?: Source[];   // nouveau
}
```

L'évènement SSE `done` porte `data.sources`. Le callback `onDone(data)` transmet donc `data.sources` au consommateur.

**`frontend/src/pages/OraclePage.tsx`**

- Le type `provider` du `useState` inclut `'opcp_companion'` ; ajout d'une `<option value="opcp_companion">OPCP Companion (RAG)</option>` dans le `<select>`.
- L'interface `Message` reçoit un champ optionnel `sources?: Source[]`. Le callback `onDone` renseigne `sources: data.sources`.
- Sous la réponse de l'assistant, si `message.sources?.length`, afficher une section « Sources » repliable (`<details>`/`<summary>` ou toggle `useState`) listant `title`, `file_path` et `similarity` (formatée en pourcentage). Aucune section si `sources` absent/vide (Req 3.5).

**`frontend/src/components/OracleWidget.tsx`**

- Même composant d'affichage des sources, réutilisé lorsque la réponse en contient. Le widget d'analyse de forum n'émet pas de sources ; le rendu reste conditionnel.

Un petit composant partagé `SourcesList` (title, file_path, similarity) peut être extrait pour éviter la duplication entre `OraclePage` et `OracleWidget`.

## Modèles de données

### Chunk (interne backend)

| Champ | Type | Origine |
|-------|------|---------|
| title | str | colonne `title` |
| file_path | str | colonne `file_path` |
| chunk_index | int | colonne `chunk_index` |
| content | str | colonne `content` |
| similarity | float | `round(1 - (embedding <=> query), 4)` |

### Source (exposée frontend)

| Champ | Type | Origine |
|-------|------|---------|
| title | str | chunk.title |
| file_path | str | chunk.file_path |
| similarity | float | chunk.similarity |

`chunk_index` et `content` ne sont pas exposés dans `Source` (Req 3.1 limite les champs à title/file_path/similarity).

## Gestion des erreurs

| Cas | Détection | Comportement | Exigence |
|-----|-----------|--------------|----------|
| Token OVH/LLM manquant | Garde en tête de `query` | Lever `Exception("Configuration manquante : OVH_AI_TOKEN …")` avant tout appel réseau | 5.3 |
| pgvector inaccessible | `try/except` autour de `_get_pg_connection`/`_search` (`psycopg2.OperationalError`, `psycopg2.Error`) | Lever une erreur décrivant l'échec de connexion à la base de données | 5.1 |
| OVH indisponible (embedding) | `try/except` autour de `embeddings.create` | Lever une erreur décrivant l'échec de l'appel OVH (embedding) | 5.2 |
| OVH indisponible (génération) | `try/except` autour de `responses.create` | Lever une erreur décrivant l'échec de l'appel OVH (génération) | 5.2 |
| Erreur pendant le streaming | Remontée jusqu'à `ask_oracle_stream` | Émettre l'évènement SSE `error` avec le message | 5.4 |
| Toute erreur | `except` dans le provider | `logger.error(...)` avant de relancer | 5.5 |

La connexion pgvector est fermée dans un bloc `finally` pour éviter les fuites de connexion, y compris en cas d'erreur d'embedding survenue après ouverture. Les messages d'erreur sont en français et ne divulguent pas de secret (pas de token dans le message).

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Le mapping des lignes pgvector préserve les champs du chunk

*For any* ensemble de lignes retournées par la recherche pgvector (title, file_path, chunk_index, content, distance), la fonction de mapping produit exactement un chunk par ligne, chaque chunk contenant les cinq champs `title`, `file_path`, `chunk_index`, `content`, `similarity`, avec `title`, `file_path`, `chunk_index` et `content` identiques à la ligne source et `similarity` égal à la valeur de similarité arrondie à 4 décimales.

**Validates: Requirements 2.2, 2.3**

### Property 2: Le contexte assemblé contient chaque chunk récupéré

*For any* liste de chunks récupérés, la chaîne de contexte produite par `_build_context` contient le `title`, le `chunk_index` et le `content` de chacun des chunks.

**Validates: Requirements 2.4**

### Property 3: La réponse du fournisseur respecte le contrat de dictionnaire

*For any* question valide, avec les backends OVH et pgvector simulés, le dictionnaire retourné par `query` contient les clés `answer`, `processing_time`, `tokens_used`, `provider` et `sources`, avec `provider` égal à `opcp_companion` et `processing_time >= 0`.

**Validates: Requirements 2.5**

### Property 4: Les sources dérivent fidèlement des chunks

*For any* ensemble de chunks récupérés, la liste `sources` retournée comporte exactement une source par chunk, chaque source portant les champs `title`, `file_path` et `similarity` égaux à ceux du chunk correspondant.

**Validates: Requirements 2.6, 3.1**

### Property 5: L'évènement `done` propage les sources du fournisseur

*For any* liste de sources produite par un fournisseur simulé, la consommation complète de `ask_oracle_stream` émet un évènement `done` dont le champ `sources` est égal à la liste de sources du fournisseur.

**Validates: Requirements 3.2**

### Property 6: Une erreur de fournisseur pendant le streaming produit un évènement `error`

*For any* message d'erreur, lorsqu'un fournisseur simulé lève une exception portant ce message, la consommation de `ask_oracle_stream` émet un évènement `error` dont le champ `message` contient ce message, et n'émet pas d'évènement `done`.

**Validates: Requirements 5.4**

## Stratégie de test

Approche double : tests unitaires/exemples pour le câblage et les cas limites, tests basés sur les propriétés (Hypothesis, déjà présent dans `requirements.txt`) pour les invariants universels. Minimum 100 itérations par test de propriété, chacun étiqueté `Feature: opcp-companion-provider, Property N: <texte>`.

**Tests de propriétés (backend, `pytest` + `hypothesis`)**
- Property 1 & 4 : générer des ensembles de lignes/chunks et vérifier les invariants de mapping via un curseur pgvector factice.
- Property 2 : générer des listes de chunks, vérifier l'inclusion dans le contexte.
- Property 3 : simuler embed/search/génération (mocks) et vérifier le contrat de dictionnaire pour toute question.
- Property 5 & 6 : fournisseur simulé (stub) renvoyant des sources ou levant une exception ; drainer `ask_oracle_stream` avec une session DB factice.

**Tests d'exemples et de câblage (INTEGRATION/EXAMPLE)**
- Factory : `get_ai_provider("opcp_companion")` retourne une instance `OpcpCompanionProvider` (Req 1.1, 1.2).
- Config `oracle_config.json` : entrée `opcp_companion` présente avec nom « OPCP Companion » (Req 1.3).
- Schéma : `OracleQuery(ai_provider="opcp_companion")` valide ; valeur inconnue rejetée (Req 1.4). `OracleResponse` accepte `sources=None` et une liste de `Source` (Req 3.1).
- Endpoint `GET /oracle/providers` inclut `opcp_companion` (Req 1.6).
- Câblage OVH/pgvector : patcher `OpenAI` et `psycopg2.connect`, vérifier les arguments (`base_url`/`api_key` embed vs llm ; `host/port/dbname/user/password`) issus de `settings` (Req 4.5, 4.6, 2.1).
- Défauts de configuration : `Settings` sans env fournit les valeurs par défaut de `rag_query.py` (Req 4.2).

**Cas limites (EDGE_CASE)**
- Token manquant : `OVH_AI_TOKEN`/`LLM_TOKEN` vide → erreur nommant la variable (Req 5.3).
- pgvector injoignable : `psycopg2.connect` lève → erreur descriptive DB (Req 5.1).
- OVH indisponible : `embeddings.create`/`responses.create` lèvent → erreur descriptive OVH (Req 5.2).
- Frontend : rendu sans `sources` → pas de section « Sources » (Req 3.5).

**Tests SMOKE / statiques**
- `.env.example` documente chaque variable RAG (Req 4.4).
- `requirements.txt` déclare `psycopg2-binary` et `openai` (Req 6.1, 6.2).
- Aucune importation du package `opcp-ai-chatbot` dans `ai_providers.py` (Req 6.4).
- Frontend : la compilation TypeScript accepte `opcp_companion` dans l'union et le type `Source` (Req 1.5, 3.3).

**Tests frontend (composant, EXAMPLE)**
- Rendu d'un message avec `sources` → section « Sources » repliable affichant title, file_path et similarity (Req 3.4).

Les mocks sont utilisés pour isoler OVH et pgvector afin d'exécuter les propriétés à faible coût ; 1 à 2 tests d'intégration réels (optionnels, ignorés si les identifiants ne sont pas configurés) valident le câblage de bout en bout.

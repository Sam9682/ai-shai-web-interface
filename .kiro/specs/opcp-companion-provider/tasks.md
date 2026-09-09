# Plan d'implémentation : OPCP Companion Provider

## Aperçu

Ce plan porte le pipeline RAG de `rag_query.py` sous forme d'une classe autonome `OpcpCompanionProvider` intégrée au module Oracle IA existant. L'implémentation est incrémentale et pilotée par les tests : on part de la configuration et des schémas (fondations), puis le fournisseur RAG, puis le câblage service/router/config, et enfin le frontend. Chaque étape s'appuie sur la précédente et se termine par une intégration sans code orphelin. Les tests de propriétés (Hypothesis) valident les 6 propriétés de correction, complétés par des tests d'exemples, de cas limites et de fumée.

Contenu utilisateur (frontend, messages d'erreur) rédigé en français.

## Tâches

- [x] 1. Étendre la configuration et les dépendances (fondations)
  - [x] 1.1 Ajouter les 13 variables RAG à `Settings` dans `app/config.py`
    - Ajouter `OVH_AI_ENDPOINT`, `OVH_AI_TOKEN`, `EMBEDDING_MODEL` (défaut `Qwen3-Embedding-8B`), `EMBEDDING_DIM` (défaut `4096`), `LLM_ENDPOINT`, `LLM_TOKEN`, `LLM_MODEL` (défaut `Qwen3-Embedding-8B`), `PG_HOST` (défaut `localhost`), `PG_PORT` (défaut `5432`), `PG_DB` (défaut `vectordb`), `PG_USER` (défaut `postgres`), `PG_PASSWORD`, `TABLE_NAME` (défaut `md_embeddings`)
    - Utiliser des variables `PG_*` explicites, distinctes de `DATABASE_URL`
    - _Requirements: 4.1, 4.2, 4.3_

  - [x] 1.2 Documenter les variables RAG dans `.env.example`
    - Ajouter une section « OPCP Companion (RAG) Configuration » documentant chacune des 13 variables
    - Noter que `LLM_ENDPOINT`/`LLM_TOKEN` vides retombent sur `OVH_AI_ENDPOINT`/`OVH_AI_TOKEN` et que `LLM_MODEL` doit être un modèle de chat
    - _Requirements: 4.4_

  - [x] 1.3 Ajouter `openai` à `requirements.txt`
    - Ajouter une version épinglée (ex. `openai==1.55.3`) ; vérifier que `psycopg2-binary` est déjà présent (ne pas dupliquer)
    - _Requirements: 6.1, 6.2_

  - [x]* 1.4 Écrire les tests de fumée config/dépendances
    - Vérifier que `Settings()` sans env fournit les défauts de `rag_query.py` (Req 4.2)
    - Vérifier que `.env.example` documente chaque variable RAG (Req 4.4)
    - Vérifier que `requirements.txt` déclare `psycopg2-binary` et `openai` (Req 6.1, 6.2)
    - _Requirements: 4.2, 4.4, 6.1, 6.2_

- [x] 2. Étendre les schémas Pydantic (`app/oracle/schemas.py`)
  - [x] 2.1 Ajouter le schéma `Source` et le champ `sources` sur `OracleResponse`
    - Créer `class Source(BaseModel)` avec `title: str`, `file_path: str`, `similarity: float`
    - Ajouter `sources: Optional[List[Source]] = None` à `OracleResponse`
    - Étendre le `Literal` de `ai_provider` à `opcp_companion` sur `OracleQuery` et `OracleAnalysisRequest`
    - _Requirements: 1.4, 3.1_

  - [x]* 2.2 Écrire les tests d'exemples des schémas
    - `OracleQuery(ai_provider="opcp_companion")` valide ; valeur inconnue rejetée (Req 1.4)
    - `OracleResponse` accepte `sources=None` et une liste de `Source` (Req 3.1)
    - _Requirements: 1.4, 3.1_

- [x] 3. Implémenter `OpcpCompanionProvider` — étapes pures (`app/oracle/ai_providers.py`)
  - [x] 3.1 Créer la classe et les fabriques de clients
    - Définir `OpcpCompanionProvider(AIProvider)` lisant sa config depuis `settings` (endpoints, tokens, modèles, `EMBEDDING_DIM`, `TABLE_NAME`, `top_k=3`)
    - Implémenter `_get_embed_client`, `_get_llm_client` (OpenAI base_url/api_key ; LLM retombe sur OVH), `_get_pg_connection` (psycopg2 host/port/dbname/user/password)
    - Aucune importation du dépôt `opcp-ai-chatbot`
    - _Requirements: 2.1, 4.5, 4.6, 6.3, 6.4_

  - [x] 3.2 Implémenter `_search` et `_chunks_to_sources`
    - `_search` : requête cosinus `embedding <=> %s::vector`, interpolation sûre de `TABLE_NAME` (config, jamais entrée utilisateur), valeurs paramétrées, vecteur sérialisé `"[v1,v2,...]"`
    - Mapping chunk : `{title, file_path, chunk_index, content, similarity}` avec `similarity = round(float(1 - distance), 4)`
    - `_chunks_to_sources` : `[{title, file_path, similarity}]`
    - _Requirements: 2.2, 2.3, 2.6, 3.1_

  - [x]* 3.3 Écrire le test de propriété du mapping des lignes pgvector
    - **Property 1 : Le mapping des lignes pgvector préserve les champs du chunk**
    - **Validates: Requirements 2.2, 2.3**
    - Générer des ensembles de lignes via curseur pgvector factice ; 1 chunk/ligne, 5 champs préservés, similarity arrondie 4 décimales ; min 100 itérations ; étiquette `Feature: opcp-companion-provider, Property 1`

  - [x]* 3.4 Écrire le test de propriété de dérivation des sources
    - **Property 4 : Les sources dérivent fidèlement des chunks**
    - **Validates: Requirements 2.6, 3.1**
    - Générer des ensembles de chunks ; 1 source/chunk avec title/file_path/similarity égaux ; min 100 itérations ; étiquette `Property 4`

  - [x] 3.5 Implémenter `_build_context`
    - Assembler `"\n\n---\n\n".join(f"[{title} — chunk {idx}]\n{content}")` à partir des chunks
    - _Requirements: 2.4_

  - [x]* 3.6 Écrire le test de propriété d'assemblage du contexte
    - **Property 2 : Le contexte assemblé contient chaque chunk récupéré**
    - **Validates: Requirements 2.4**
    - Générer des listes de chunks ; vérifier inclusion de title, chunk_index et content de chacun ; min 100 itérations ; étiquette `Property 2`

- [x] 4. Implémenter `OpcpCompanionProvider.query` et enregistrer le fournisseur
  - [x] 4.1 Implémenter la méthode `query` (pipeline complet + garde + erreurs)
    - Garde de token en tête : si `OVH_AI_TOKEN` (embed) ou `LLM_TOKEN` (génération) vide, lever une erreur française nommant la variable manquante (Req 5.3)
    - `_embed_query` puis `_search` puis `_build_context` puis génération `responses.create(model, instructions, input, store=False, max_output_tokens, temperature)` ; `answer = response.output_text.strip()`
    - `tokens_used` depuis `response.usage.total_tokens` sinon `len(answer.split())`
    - Exécuter les appels bloquants (psycopg2, client OpenAI) via `await asyncio.to_thread(...)`
    - Gestion d'erreurs : try/except autour de connexion/recherche (erreur DB, Req 5.1), embeddings.create et responses.create (erreur OVH, Req 5.2) ; `logger.error(...)` avant relance (Req 5.5) ; fermeture connexion dans `finally` ; messages en français sans divulguer de secret
    - Retour : `{answer, processing_time (>=0), tokens_used, provider: "opcp_companion", sources}`
    - _Requirements: 2.1, 2.4, 2.5, 2.6, 5.1, 5.2, 5.3, 5.5_

  - [x] 4.2 Enregistrer `opcp_companion` dans `get_ai_provider`
    - Ajouter `"opcp_companion": OpcpCompanionProvider` au dictionnaire de la factory
    - _Requirements: 1.1, 1.2_

  - [x]* 4.3 Écrire le test de propriété du contrat de dictionnaire
    - **Property 3 : La réponse du fournisseur respecte le contrat de dictionnaire**
    - **Validates: Requirements 2.5**
    - Simuler embed/search/génération (mocks) ; vérifier clés `answer, processing_time, tokens_used, provider, sources`, `provider == "opcp_companion"`, `processing_time >= 0` ; min 100 itérations ; étiquette `Property 3`

  - [x]* 4.4 Écrire les tests de câblage et de cas limites du fournisseur
    - Factory : `get_ai_provider("opcp_companion")` retourne une instance `OpcpCompanionProvider` (Req 1.1, 1.2)
    - Câblage : patcher `OpenAI` et `psycopg2.connect`, vérifier `base_url`/`api_key` embed vs llm et `host/port/dbname/user/password` issus de `settings` (Req 4.5, 4.6, 2.1)
    - Cas limites : token vide → erreur nommant la variable (Req 5.3) ; `psycopg2.connect` lève → erreur DB descriptive (Req 5.1) ; `embeddings.create`/`responses.create` lèvent → erreur OVH descriptive (Req 5.2)
    - Fumée : aucune importation de `opcp-ai-chatbot` dans `ai_providers.py` (Req 6.4)
    - _Requirements: 1.1, 1.2, 2.1, 4.5, 4.6, 5.1, 5.2, 5.3, 6.4_

- [x] 5. Checkpoint - Vérifier que tous les tests backend passent
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Câbler les sources dans le service, le router et la config
  - [x] 6.1 Propager les sources dans `app/oracle/service.py`
    - `ask_oracle` : passer `sources=result.get("sources")` à la construction de `OracleResponse`
    - `ask_oracle_stream` : ajouter `'sources': result.get("sources")` à la charge utile de l'évènement `done` ; laisser la branche `error` inchangée (porte `message`)
    - Ne pas persister les sources dans `OracleQueryModel`
    - _Requirements: 3.1, 3.2, 5.4_

  - [x]* 6.2 Écrire le test de propriété de propagation des sources dans `done`
    - **Property 5 : L'évènement `done` propage les sources du fournisseur**
    - **Validates: Requirements 3.2**
    - Fournisseur simulé renvoyant des sources ; drainer `ask_oracle_stream` avec session DB factice ; `done.sources == sources` ; min 100 itérations ; étiquette `Property 5`

  - [x]* 6.3 Écrire le test de propriété d'erreur pendant le streaming
    - **Property 6 : Une erreur de fournisseur pendant le streaming produit un évènement `error`**
    - **Validates: Requirements 5.4**
    - Fournisseur simulé levant une exception ; drainer `ask_oracle_stream` ; évènement `error` avec message inclus, pas d'évènement `done` ; min 100 itérations ; étiquette `Property 6`

  - [x] 6.4 Ajouter `opcp_companion` à `GET /oracle/providers` (`app/oracle/router.py`)
    - Ajouter l'entrée `{id, name: "OPCP Companion", description, default: False}` à la liste retournée
    - _Requirements: 1.6_

  - [x] 6.5 Ajouter l'entrée `opcp_companion` à `oracle_config.json`
    - Section `providers` : `{name: "OPCP Companion", type: "cloud", rag: true, requires_api_key: true, env_var: "OVH_AI_TOKEN", description}`
    - _Requirements: 1.3_

  - [x]* 6.6 Écrire les tests de câblage service/router/config
    - Endpoint `GET /oracle/providers` inclut `opcp_companion` (Req 1.6)
    - Config `oracle_config.json` : entrée `opcp_companion` présente avec nom « OPCP Companion » (Req 1.3)
    - _Requirements: 1.3, 1.6_

- [x] 7. Checkpoint - Vérifier que le câblage backend passe
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Frontend — types et service (`frontend/src/services/oracleService.ts`)
  - [x] 8.1 Étendre les types du service Oracle
    - Ajouter `interface Source { title: string; file_path: string; similarity: number }`
    - Étendre l'union `ai_provider` à `'shai' | 'kiro' | 'openai' | 'opcp_companion'`
    - Ajouter `sources?: Source[]` à `OracleResponse` ; transmettre `data.sources` via `onDone(data)` de l'évènement SSE `done`
    - _Requirements: 1.5, 3.2, 3.3_

  - [x]* 8.2 Écrire le test de fumée TypeScript des types
    - Vérifier que la compilation TS accepte `opcp_companion` dans l'union et le type `Source` (Req 1.5, 3.3)
    - _Requirements: 1.5, 3.3_

- [x] 9. Frontend — affichage des sources
  - [x] 9.1 Créer le composant partagé `SourcesList`
    - Composant affichant une section « Sources » repliable (`<details>`/`<summary>`) listant title, file_path et similarity (formatée en pourcentage)
    - Rendu conditionnel : rien si `sources` absent/vide
    - _Requirements: 3.4, 3.5_

  - [x] 9.2 Intégrer sources dans `frontend/src/pages/OraclePage.tsx`
    - Ajouter `'opcp_companion'` au type du `useState` et une `<option value="opcp_companion">OPCP Companion (RAG)</option>`
    - Ajouter `sources?: Source[]` à l'interface `Message` ; `onDone` renseigne `sources: data.sources`
    - Afficher `SourcesList` sous la réponse de l'assistant quand `message.sources?.length`
    - _Requirements: 1.5, 3.4, 3.5_

  - [x] 9.3 Intégrer sources dans `frontend/src/components/OracleWidget.tsx`
    - Réutiliser `SourcesList` en rendu conditionnel lorsque la réponse contient des sources
    - _Requirements: 3.4, 3.5_

  - [x]* 9.4 Écrire les tests de composant frontend
    - Message avec `sources` → section « Sources » repliable affichant title, file_path et similarity (Req 3.4)
    - Message sans `sources` → pas de section « Sources » (Req 3.5)
    - _Requirements: 3.4, 3.5_

- [x] 10. Checkpoint final - Vérifier que tous les tests (backend + frontend) passent
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Les tâches marquées `*` sont des tests optionnels ; elles peuvent être ignorées pour un MVP plus rapide mais valident les 6 propriétés de correction et les cas limites.
- Chaque tâche référence des exigences spécifiques pour la traçabilité.
- Les propriétés 1 à 6 correspondent à la section « Correctness Properties » du design ; chaque test de propriété exécute au minimum 100 itérations via Hypothesis et porte l'étiquette `Feature: opcp-companion-provider, Property N`.
- Les mocks isolent OVH et pgvector afin d'exécuter les propriétés à faible coût.
- Les checkpoints assurent une validation incrémentale.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3", "6.5"] },
    { "id": 1, "tasks": ["1.4", "2.1", "3.1", "8.1"] },
    { "id": 2, "tasks": ["2.2", "3.2", "3.5", "8.2", "9.1"] },
    { "id": 3, "tasks": ["3.3", "3.4", "3.6", "4.1", "9.2", "9.3"] },
    { "id": 4, "tasks": ["4.2", "4.3", "6.1", "6.4", "9.4"] },
    { "id": 5, "tasks": ["4.4", "6.2", "6.3", "6.6"] }
  ]
}
```

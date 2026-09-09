# Requirements Document

## Introduction

Cette fonctionnalité ajoute un nouveau fournisseur d'IA nommé « OPCP Companion » au module Oracle IA de l'application ai-shai-web-interface. OPCP Companion est un service de type RAG (Retrieval-Augmented Generation) porté depuis le dépôt opcp-ai-chatbot (rag_query.py). Le pipeline RAG intègre une requête vers l'utilisateur : génération d'un embedding de la question, récupération des k meilleurs fragments (chunks) depuis une base pgvector Postgres existante, puis génération d'une réponse par un LLM via les OVH AI Endpoints.

Le fournisseur doit apparaître comme une option sélectionnable dans l'Oracle IA, réutiliser la base pgvector Postgres existante, et présenter les sources ayant servi à la génération de la réponse. La logique RAG est copiée (vendored) dans l'application sous forme d'une classe autonome, sans dépendance d'exécution au dépôt voisin.

## Glossary

- **Oracle_System** : Le module backend Oracle IA (app/oracle) exposant les requêtes IA via API et SSE.
- **OpcpCompanionProvider** : Classe fournisseur d'IA implémentant l'interface AIProvider, portant la logique RAG dans app/oracle/ai_providers.py.
- **Provider_Factory** : La fonction usine get_ai_provider(provider_name) qui instancie un fournisseur d'IA à partir de sa clé.
- **RAG_Pipeline** : Le processus en trois étapes exécuté par OpcpCompanionProvider : génération d'embedding, récupération pgvector, génération LLM.
- **Pgvector_Store** : La base de données Postgres existante avec l'extension pgvector, contenant les fragments indexés dans la table nommée par TABLE_NAME.
- **OVH_Endpoints** : Les OVH AI Endpoints fournissant les services d'embedding et de génération LLM via le client OpenAI.
- **Chunk** : Un fragment récupéré depuis Pgvector_Store contenant title, file_path, chunk_index, content et similarity.
- **Source** : Une entrée de citation dérivée d'un Chunk, affichée à l'utilisateur avec title, file_path et similarity.
- **Oracle_Service** : Le service backend (app/oracle/service.py) exposant ask_oracle et ask_oracle_stream, persistant les requêtes dans OracleQueryModel et émettant les évènements SSE token/done/error.
- **Oracle_Config** : Le fichier oracle_config.json listant les fournisseurs d'IA disponibles.
- **App_Settings** : La configuration Pydantic Settings de l'application (app/config.py).
- **Oracle_Frontend** : Les composants frontend OraclePage.tsx et OracleWidget.tsx, ainsi que le service oracleService.ts.
- **SSE** : Server-Sent Events, mécanisme de streaming des réponses vers Oracle_Frontend.

## Requirements

### Requirement 1 : Enregistrement et sélection du fournisseur

**User Story:** En tant qu'utilisateur de l'Oracle IA, je veux sélectionner « OPCP Companion » comme fournisseur d'IA, afin d'obtenir des réponses basées sur la base documentaire pgvector de l'OPCP.

#### Acceptance Criteria

1. THE Provider_Factory SHALL enregistrer OpcpCompanionProvider sous la clé `opcp_companion`.
2. WHEN Provider_Factory reçoit la valeur `opcp_companion`, THE Provider_Factory SHALL retourner une instance de OpcpCompanionProvider.
3. THE Oracle_Config SHALL inclure une entrée `opcp_companion` dans la section `providers` avec un nom d'affichage « OPCP Companion ».
4. THE Oracle_System SHALL accepter la valeur `opcp_companion` dans le champ `ai_provider` du schéma OracleQuery.
5. THE Oracle_Frontend SHALL inclure `opcp_companion` dans le type union `ai_provider` de oracleService.ts.
6. WHEN Oracle_Frontend appelle GET /oracle/providers, THE Oracle_System SHALL inclure `opcp_companion` dans la liste des fournisseurs disponibles.

### Requirement 2 : Pipeline de requête RAG

**User Story:** En tant qu'utilisateur, je veux que ma question soit traitée par un pipeline RAG, afin d'obtenir une réponse générée à partir des documents pertinents indexés.

#### Acceptance Criteria

1. WHEN OpcpCompanionProvider reçoit une question, THE OpcpCompanionProvider SHALL générer un embedding de la question via OVH_Endpoints en utilisant le modèle défini par EMBEDDING_MODEL.
2. WHEN l'embedding de la question est généré, THE OpcpCompanionProvider SHALL récupérer les k meilleurs Chunk depuis Pgvector_Store par recherche cosinus (embedding `<=>` vector) contre la table nommée par TABLE_NAME.
3. THE OpcpCompanionProvider SHALL produire pour chaque Chunk récupéré les champs title, file_path, chunk_index, content et similarity.
4. WHEN les Chunk sont récupérés, THE OpcpCompanionProvider SHALL générer une réponse via OVH_Endpoints en utilisant le modèle défini par LLM_MODEL avec les Chunk récupérés comme contexte.
5. THE OpcpCompanionProvider SHALL retourner un dictionnaire contenant answer, processing_time, tokens_used et provider égal à `opcp_companion`.
6. WHEN OpcpCompanionProvider retourne une réponse, THE OpcpCompanionProvider SHALL inclure la liste des Source dérivées des Chunk récupérés.

### Requirement 3 : Restitution des citations et sources

**User Story:** En tant qu'utilisateur, je veux voir les sources ayant servi à générer la réponse, afin de vérifier l'origine des informations fournies.

#### Acceptance Criteria

1. THE Oracle_System SHALL inclure dans le schéma de réponse OracleResponse une liste optionnelle de Source contenant title, file_path et similarity.
2. WHEN Oracle_Service émet l'évènement SSE `done`, THE Oracle_Service SHALL inclure les données de Source dans la charge utile de l'évènement.
3. THE Oracle_Frontend SHALL définir dans oracleService.ts les types portant les champs title, file_path et similarity pour chaque Source.
4. WHEN Oracle_Frontend reçoit une réponse contenant des Source, THE Oracle_Frontend SHALL afficher la réponse suivie d'une liste « Sources » repliable présentant title, file_path et similarity.
5. WHERE la réponse ne contient aucune Source, THE Oracle_Frontend SHALL afficher la réponse sans la liste « Sources ».

### Requirement 4 : Configuration et variables d'environnement

**User Story:** En tant qu'administrateur, je veux configurer les identifiants et paramètres RAG via des variables d'environnement, afin de connecter le fournisseur aux endpoints OVH et à la base pgvector.

#### Acceptance Criteria

1. THE App_Settings SHALL définir les variables de configuration OVH_AI_ENDPOINT, OVH_AI_TOKEN, EMBEDDING_MODEL, EMBEDDING_DIM, LLM_ENDPOINT, LLM_TOKEN, LLM_MODEL, PG_HOST, PG_PORT, PG_DB, PG_USER, PG_PASSWORD et TABLE_NAME.
2. THE App_Settings SHALL fournir des valeurs par défaut pour ces variables issues de rag_query.py.
3. THE App_Settings SHALL utiliser des variables PG_* explicites pour la connexion Postgres au lieu d'une variable DATABASE_URL.
4. THE fichier .env.example SHALL documenter chacune des variables de configuration RAG définies dans App_Settings.
5. WHEN OpcpCompanionProvider se connecte à Pgvector_Store, THE OpcpCompanionProvider SHALL utiliser les variables PG_HOST, PG_PORT, PG_DB, PG_USER et PG_PASSWORD.
6. WHEN OpcpCompanionProvider appelle OVH_Endpoints, THE OpcpCompanionProvider SHALL utiliser OVH_AI_ENDPOINT et OVH_AI_TOKEN pour les embeddings, et LLM_ENDPOINT et LLM_TOKEN pour la génération.

### Requirement 5 : Gestion des erreurs

**User Story:** En tant qu'utilisateur, je veux recevoir un message d'erreur clair lorsque le service RAG est indisponible, afin de comprendre le problème et de choisir un autre fournisseur.

#### Acceptance Criteria

1. IF Pgvector_Store est inaccessible lors d'une requête, THEN THE OpcpCompanionProvider SHALL lever une erreur avec un message décrivant l'échec de connexion à la base de données.
2. IF OVH_Endpoints est indisponible lors de la génération d'embedding ou de la génération LLM, THEN THE OpcpCompanionProvider SHALL lever une erreur avec un message décrivant l'échec de l'appel à l'endpoint OVH.
3. IF OVH_AI_TOKEN ou LLM_TOKEN n'est pas configuré, THEN THE OpcpCompanionProvider SHALL lever une erreur indiquant la variable de configuration manquante.
4. WHEN OpcpCompanionProvider lève une erreur pendant un streaming, THE Oracle_Service SHALL émettre un évènement SSE `error` contenant le message d'erreur.
5. WHEN une erreur survient, THE OpcpCompanionProvider SHALL journaliser l'erreur via le logger de l'application.

### Requirement 6 : Ajout des dépendances backend

**User Story:** En tant que développeur, je veux que les dépendances requises soient déclarées, afin que le fournisseur RAG fonctionne dans l'environnement backend.

#### Acceptance Criteria

1. THE fichier requirements.txt SHALL déclarer la dépendance psycopg2-binary.
2. THE fichier requirements.txt SHALL déclarer la dépendance openai.
3. THE OpcpCompanionProvider SHALL utiliser le client OpenAI pour la génération d'embeddings et la génération de réponses via OVH_Endpoints.
4. THE OpcpCompanionProvider SHALL fonctionner sans dépendance d'exécution au dépôt opcp-ai-chatbot.

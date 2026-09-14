# Design Document

## Overview

This feature injects a domain-specific skill context into the Shai provider only. When `ShaiAIProvider.query()` runs, it reads a new file `conf/shai_context.md` and prepends that content ahead of any existing `Contexte:` block and the user question. The change is small and localized: a module-level constant for the file path, a small helper to load the skill context defensively, and a one-line change to how the Shai prompt is assembled.

The skill context tells the model that the working domain is OPCP (On Premise Cloud Platform, from OVH) and instructs it to consult `./docs/opcp_external_docs` before answering. If the file is missing or unreadable, the provider logs a French warning and continues with the legacy prompt (existing context + question), never raising because of the file.

Nothing else changes. Kiro, OpenAI, and OPCP Companion providers keep their current prompt-building behavior. There are no frontend changes.

## Architecture

```
ShaiAIProvider.query(question, context)
        │
        ▼
_load_shai_skill_context()  ──►  read conf/shai_context.md
        │                              │
        │                              ├─ ok       → returns stripped content
        │                              └─ missing/ → logger.warning(...) → returns None
        │                                 unreadable
        ▼
_build_shai_prompt(skill_context, context, question)
        │
        ▼
subprocess: shai <assembled_prompt>   (unchanged execution / parsing)
```

The only new logic sits before the existing subprocess call. Prompt execution, ANSI stripping, box-drawing cleanup, timeout handling, and the return payload are untouched.

## Components and Interfaces

### Module-level constant

Following the existing convention in `app/oracle/ai_providers.py` (e.g. `SYSTEM_PROMPT` declared at module scope) and the relative-path convention in `app/config.py` (e.g. `DOCS_SEED_DIR = "./docs/to_publish"`), the skill-context path is a module-level constant resolved relative to the project root (the process working directory, `/app` in the container).

```python
# Chemin du fichier de contexte métier injecté dans le fournisseur Shai,
# relatif à la racine du projet (même convention que app.config, ex. DOCS_SEED_DIR).
SHAI_SKILL_CONTEXT_PATH = "conf/shai_context.md"
```

### Skill context loader

A small module-level helper (not a method) that reads the file defensively. It returns the stripped content on success, or `None` on any failure, logging a French warning in the failure case. It never raises.

```python
def _load_shai_skill_context() -> Optional[str]:
    """Lit le contexte métier Shai depuis SHAI_SKILL_CONTEXT_PATH.

    Retourne le contenu (sans espaces superflus) en cas de succès, sinon None.
    Un fichier manquant ou illisible n'interrompt pas la requête : un
    avertissement est journalisé et None est retourné.
    """
    try:
        with open(SHAI_SKILL_CONTEXT_PATH, "r", encoding="utf-8") as f:
            content = f.read().strip()
        return content or None
    except OSError as e:
        logger.warning(
            f"Contexte métier Shai indisponible ({SHAI_SKILL_CONTEXT_PATH}) : "
            f"{str(e)}. Poursuite sans le contexte métier."
        )
        return None
```

`OSError` covers both the missing-file case (`FileNotFoundError`) and the unreadable case (`PermissionError`, `IsADirectoryError`, and other I/O errors), which are all subclasses of `OSError`. An empty file is treated as "no skill context" so no empty section is injected.

### Prompt assembly

A small module-level helper builds the assembled prompt from the three parts. It preserves the existing `Contexte: {context}\n\nQuestion: {question}` shape and prepends the skill context when present.

```python
def _build_shai_prompt(
    skill_context: Optional[str],
    context: Optional[str],
    question: str,
) -> str:
    """Assemble le prompt Shai : contexte métier (optionnel) + contexte existant
    (optionnel) + question. Combine sans remplacer le contexte existant."""
    parts = []
    if skill_context:
        parts.append(skill_context)
    if context:
        parts.append(f"Contexte: {context}")
    parts.append(f"Question: {question}")
    return "\n\n".join(parts)
```

Behavioral notes:
- Skill context, when present, is always first.
- Existing context is combined, never replaced: when `context` is present its `Contexte: {context}` block is retained.
- When there is no skill context and no existing context, the result is `Question: {question}`. This is a minor formatting change from today's bare `question` string, but it keeps assembly uniform and does not alter the semantic content sent to the CLI. (If exact byte-for-byte parity of the no-context/no-skill case is desired, the caller can special-case it; the requirements do not require this.)

### Change to `ShaiAIProvider.query()`

The existing prompt-building block:

```python
prompt = question
if context:
    prompt = f"Contexte: {context}\n\nQuestion: {question}"
```

is replaced with:

```python
skill_context = _load_shai_skill_context()
prompt = _build_shai_prompt(skill_context, context, question)
```

Everything after this (environment setup, subprocess execution, output cleanup, return value) is unchanged.

### Untouched providers

`KiroAIProvider`, `OpenAIProvider`, and `OpcpCompanionProvider` are not modified. Their prompt/message assembly and the `SYSTEM_PROMPT` constant remain exactly as they are today. The new loader and builder helpers are called only from `ShaiAIProvider.query()`.

## Data Models

No persistent data models. The only new artifact is the content of `conf/shai_context.md`.

### `conf/shai_context.md` (new file)

A short Markdown file, written in French to match repository conventions, that:
- states OPCP means On Premise Cloud Platform, a product from OVH (Req 1.2);
- instructs the model to read the latest information in `./docs/opcp_external_docs` before answering (Req 1.3).

Proposed content:

```markdown
# Contexte métier Shai — OPCP

Tu interviens dans le domaine **OPCP** (On Premise Cloud Platform), un produit
de la société **OVH**.

Avant de répondre, consulte les dernières informations de référence situées
dans le répertoire `./docs/opcp_external_docs`, puis fonde ta réponse sur cette
documentation.
```

## Error Handling

| Situation | Behavior |
|-----------|----------|
| `conf/shai_context.md` missing (`FileNotFoundError`) | `_load_shai_skill_context()` logs `logger.warning(...)`, returns `None`; prompt assembled from context + question. Request proceeds. |
| `conf/shai_context.md` unreadable (`PermissionError`, `IsADirectoryError`, other I/O) | Same as missing: warning logged, `None` returned, request proceeds. |
| File present but empty / whitespace-only | Treated as no skill context (`None` after strip); no empty section injected. |
| File read successfully | Content prepended ahead of existing context and question. |

The loader catches `OSError` specifically (the base class for filesystem errors) rather than a bare `except`, so unrelated programming errors are not silently swallowed. No exception from the load step propagates out of `query()` (Req 3.4). Existing Shai CLI error handling (non-zero return code, timeout, empty output) is unchanged.

## Testing Strategy

Dual approach:
- **Property tests** for the input-varying assembly and degradation behavior (min. 100 iterations each), driven by generated `question`, `context`, and `skill_context` values.
- **Example / smoke tests** for the static file content and the warning side effect, and regression checks that other providers are untouched.

Test seams: `_build_shai_prompt` is a pure function and can be property-tested directly. `_load_shai_skill_context` can be tested by pointing `SHAI_SKILL_CONTEXT_PATH` at a temporary file (present, empty, missing, or a directory to force an error) and capturing the logger.

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Successful-read prompt assembly preserves order and all parts

*For any* non-empty skill context, *any* user question, and *any* existing context value (present or absent), when the skill context is read successfully, the assembled prompt SHALL place the skill context before any existing context, place any existing context before the question, include the question, and — when an existing context is present — retain that existing context text (combine, not replace).

**Validates: Requirements 2.1, 2.2, 2.3, 2.4**

### Property 2: Missing or unreadable file degrades gracefully

*For any* user question and *any* existing context value, when the skill context file is missing or unreadable, the assembled prompt SHALL be composed only of the existing context (when present) and the question with no skill context included, and assembly SHALL complete without raising an error caused by the missing or unreadable file.

**Validates: Requirements 3.1, 3.2, 3.4**

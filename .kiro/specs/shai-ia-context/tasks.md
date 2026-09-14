# Implementation Plan: Shai IA Context Injection

## Overview

Backend-only change scoped to the Shai provider. First add the domain skill-context file `conf/shai_context.md`. Then add a module-level path constant, a defensive loader, and a pure prompt builder in `app/oracle/ai_providers.py`. Finally wire `ShaiAIProvider.query()` to use them, and cover the behavior with property and example tests in `tests/`. Other providers and the frontend are untouched.

## Tasks

- [x] 1. Create the Shai skill-context file
  - Create `conf/shai_context.md` written in French
  - State that OPCP means On Premise Cloud Platform, a product from OVH
  - Instruct the model to read the latest reference docs in `./docs/opcp_external_docs` before answering
  - _Requirements: 1.1, 1.2, 1.3_

- [x] 2. Add the skill-context path constant and loader
  - [x] 2.1 Add `SHAI_SKILL_CONTEXT_PATH = "conf/shai_context.md"` module-level constant in `app/oracle/ai_providers.py`
    - Place near other module-level constants (e.g. `SYSTEM_PROMPT`), with a French comment noting the relative-path convention
    - _Requirements: 1.1_

  - [x] 2.2 Implement `_load_shai_skill_context() -> Optional[str]`
    - Open `SHAI_SKILL_CONTEXT_PATH` (utf-8), return stripped content, treat empty/whitespace-only as `None`
    - Catch `OSError` (covers missing and unreadable), call `logger.warning(...)` with a French message, return `None`; never raise
    - Ensure `Optional` is imported
    - _Requirements: 2.1, 3.1, 3.2, 3.3, 3.4_

  - [x]* 2.3 Write unit tests for `_load_shai_skill_context()`
    - Point `SHAI_SKILL_CONTEXT_PATH` at a temp file for: success, empty file → `None`, missing file → `None` + warning, directory/unreadable → `None` + warning
    - Assert `logger.warning` is called on the failure paths and no exception propagates
    - _Requirements: 2.1, 3.1, 3.2, 3.3, 3.4_

- [x] 3. Add the prompt builder
  - [x] 3.1 Implement `_build_shai_prompt(skill_context, context, question) -> str`
    - Prepend skill context when present, then `Contexte: {context}` when present, then `Question: {question}`, joined with blank lines
    - Combine (never replace) existing context
    - _Requirements: 2.2, 2.3, 2.4_

  - [x]* 3.2 Write property test for successful-read prompt assembly
    - **Property 1: Successful-read prompt assembly preserves order and all parts**
    - **Validates: Requirements 2.1, 2.2, 2.3, 2.4**
    - Generate non-empty `skill_context`, arbitrary `question`, and present/absent `context`; assert skill context precedes context, context precedes question, question is included, and existing context text is retained when present (min. 100 iterations)

  - [x]* 3.3 Write property test for missing/unreadable graceful degradation
    - **Property 2: Missing or unreadable file degrades gracefully**
    - **Validates: Requirements 3.1, 3.2, 3.4**
    - With `skill_context=None`, generate arbitrary `question` and present/absent `context`; assert assembled prompt contains only existing context (when present) and the question, no skill context, and no error is raised (min. 100 iterations)

- [x] 4. Wire `ShaiAIProvider.query()` to use the new helpers
  - Replace the inline prompt-building block with `skill_context = _load_shai_skill_context()` then `prompt = _build_shai_prompt(skill_context, context, question)`
  - Leave environment setup, subprocess execution, output cleanup, and return payload unchanged
  - _Requirements: 2.1, 2.2, 2.3, 2.4_

- [x] 5. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Regression coverage for scope
  - [x]* 6.1 Write tests asserting other providers are unchanged
    - Verify `KiroAIProvider`, `OpenAIProvider`, and `OpcpCompanionProvider` prompt/message assembly does not read the skill-context file and behaves as before
    - _Requirements: 2.5_

  - [x]* 6.2 Write integration test for `ShaiAIProvider.query()` prompt assembly
    - Mock the subprocess call; assert the assembled prompt passed to the Shai CLI includes skill context ahead of existing context and question when the file is present, and degrades to context + question when the file is missing
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 3.1, 3.4_

- [x] 7. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP.
- Each task references specific requirements for traceability.
- Property tests validate the universal correctness properties from the design; unit and integration tests validate specific cases and side effects.
- Tests live in the project-root `tests/` directory using pytest + hypothesis, matching repository conventions.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1", "2.1"] },
    { "id": 1, "tasks": ["2.2", "3.1"] },
    { "id": 2, "tasks": ["2.3", "3.2", "3.3", "4"] },
    { "id": 3, "tasks": ["6.1", "6.2"] }
  ]
}
```

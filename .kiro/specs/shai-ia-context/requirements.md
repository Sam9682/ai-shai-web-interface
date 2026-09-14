# Requirements Document

## Introduction

This feature injects a domain-specific skill context into the Shai LLM provider of the FastAPI backend. When a request is sent to Shai, the injected context informs the model that the working domain is OPCP (On Premise Cloud Platform by OVH) and instructs the model to consult the reference documentation located at `./docs/opcp_external_docs` before answering.

The injection is scoped exclusively to the Shai provider at the single request path `app/oracle/ai_providers.py` → `ShaiAIProvider.query()`. The skill context is read from a new file at `conf/shai_context.md` and is prepended ahead of any existing context and the user question. Existing `Contexte:` handling is preserved by combining rather than replacing. No frontend changes are made, and the Kiro, OpenAI, and OPCP Companion providers remain unchanged.

## Glossary

- **Shai_Provider**: The `ShaiAIProvider` class in `app/oracle/ai_providers.py`, whose `query()` method is the single injection point for the skill context.
- **Skill_Context**: The text content read from the file `conf/shai_context.md`, describing the OPCP domain and instructing the model to read the reference documentation before answering.
- **Skill_Context_File**: The file located at `conf/shai_context.md` relative to the project root.
- **Reference_Documentation_Path**: The directory `./docs/opcp_external_docs` containing the latest OPCP reference documentation.
- **OPCP**: On Premise Cloud Platform, a product from the OVH company.
- **Existing_Context**: The optional `context` string passed to `ShaiAIProvider.query()`, formatted as `Contexte: {context}` when present.
- **User_Question**: The `question` string passed to `ShaiAIProvider.query()`.
- **Assembled_Prompt**: The final prompt string sent to the Shai CLI, composed of the Skill_Context, the Existing_Context, and the User_Question.

## Requirements

### Requirement 1

**User Story:** As a backend developer, I want a skill context file describing the OPCP domain, so that the Shai model can be told which domain it operates in and where to find reference documentation.

#### Acceptance Criteria

1. THE Skill_Context_File SHALL be located at the path `conf/shai_context.md` relative to the project root.
2. THE Skill_Context_File SHALL state that OPCP means On Premise Cloud Platform from the OVH company.
3. THE Skill_Context_File SHALL instruct the model to read the latest information located at `./docs/opcp_external_docs` before answering.

### Requirement 2

**User Story:** As a backend developer, I want the skill context injected only into the Shai provider, so that other providers behave exactly as before.

#### Acceptance Criteria

1. WHEN `ShaiAIProvider.query()` is invoked, THE Shai_Provider SHALL read the Skill_Context from the Skill_Context_File.
2. WHEN the Skill_Context is read successfully, THE Shai_Provider SHALL prepend the Skill_Context ahead of the Existing_Context and the User_Question in the Assembled_Prompt.
3. WHERE the Existing_Context is present, THE Shai_Provider SHALL combine the Skill_Context with the Existing_Context and the User_Question rather than replacing the Existing_Context.
4. WHERE the Existing_Context is absent, THE Shai_Provider SHALL combine the Skill_Context with the User_Question in the Assembled_Prompt.
5. THE Kiro provider, THE OpenAI provider, and THE OPCP Companion provider SHALL send prompts unchanged from their current behavior.

### Requirement 3

**User Story:** As a backend operator, I want the Shai request to remain functional when the context file is unavailable, so that a missing or unreadable file does not break Shai requests.

#### Acceptance Criteria

1. IF the Skill_Context_File is missing at request time, THEN THE Shai_Provider SHALL assemble the Assembled_Prompt from the Existing_Context and the User_Question without the Skill_Context.
2. IF the Skill_Context_File is unreadable at request time, THEN THE Shai_Provider SHALL assemble the Assembled_Prompt from the Existing_Context and the User_Question without the Skill_Context.
3. IF the Skill_Context_File is missing or unreadable at request time, THEN THE Shai_Provider SHALL log a warning message.
4. IF the Skill_Context_File is missing or unreadable at request time, THEN THE Shai_Provider SHALL complete the Shai request without raising an error caused by the missing or unreadable file.

# Bugfix Requirements Document

## Introduction

The backend container (`ai-shai-web-interface-app`) fails to start because `app/info/config.py` contains two triple-quoted (`"""`) string literals that are opened but never closed. The `STATUTES.content` and `REGULATIONS.content` fields each begin a `"""` string that runs into the constructor's closing `)` without a terminating `"""`. Python reports an "unterminated string literal" at line 71, which aborts the import chain (`app.main` → `app.info.router` → `app.info.config`) and prevents uvicorn from importing the FastAPI application. The result is a complete backend startup failure. This bugfix ensures the module parses and imports cleanly with every `LegalDocument` content string properly terminated.

## Bug Analysis

### Current Behavior (Defect)

When the backend attempts to import `app/info/config.py`, the unterminated triple-quoted strings cause a fatal parse error.

1.1 WHEN Python parses `app/info/config.py` and reaches the unterminated `STATUTES.content` triple-quoted string THEN the system raises a `SyntaxError: unterminated string literal`
1.2 WHEN the `REGULATIONS` constructor closing `)` is consumed as part of the unterminated `STATUTES.content` string THEN the system fails to parse the remaining module and reports the error at line 71
1.3 WHEN `app/info/config.py` fails to parse THEN the system aborts the import chain (`app.main` → `app.info.router` → `app.info.config`) and uvicorn cannot import the FastAPI app, so the backend container fails to start

### Expected Behavior (Correct)

The module should parse and import cleanly with each `LegalDocument` content string properly closed.

2.1 WHEN Python parses `app/info/config.py` THEN the system SHALL find every triple-quoted `content` string properly terminated with a closing `"""` before the constructor's closing `)`
2.2 WHEN the `STATUTES` and `REGULATIONS` `LegalDocument` objects are constructed THEN the system SHALL assign each a fully terminated, valid string `content` value
2.3 WHEN `app/info/config.py` is imported THEN the system SHALL complete the import chain (`app.main` → `app.info.router` → `app.info.config`) without a `SyntaxError`, allowing uvicorn to import the FastAPI app and the backend to start normally

### Unchanged Behavior (Regression Prevention)

Everything else in the module must remain functionally identical.

3.1 WHEN the module is imported THEN the system SHALL CONTINUE TO expose `PSMC_INFO`, `MISSION`, `ACTIVITIES`, `CONTACT_EMAIL`, `CONTACT_PHONE`, `FINANCIAL_REPORTS`, and `BOARD_LAST_UPDATED` with their existing values
3.2 WHEN the `MISSION` and `ACTIVITIES` strings (which are already correctly terminated) are read THEN the system SHALL CONTINUE TO return their existing content unchanged
3.3 WHEN `STATUTES` and `REGULATIONS` are constructed THEN the system SHALL CONTINUE TO use their existing `title` and `description` field values unchanged
3.4 WHEN any module that imports from `app.info.config` (such as `app.info.router`) accesses these symbols THEN the system SHALL CONTINUE TO resolve them with the same names and types as before

## Bug Condition and Property

**Bug Condition** — identifies the inputs that trigger the bug:

```pascal
FUNCTION isBugCondition(source)
  INPUT: source of type ModuleSource   // the text of app/info/config.py
  OUTPUT: boolean

  // True when a LegalDocument content field opens a triple-quoted
  // string that is never closed before the constructor's closing ")"
  RETURN hasUnterminatedTripleQuotedString(source)
END FUNCTION
```

**Property: Fix Checking** — desired behavior for the buggy input:

```pascal
// Property: Fix Checking - module parses and imports cleanly
FOR ALL source WHERE isBugCondition(source) DO
  result ← import'(source)     // F' = the fixed module
  ASSERT no_syntax_error(result)
      AND STATUTES.content is a terminated string
      AND REGULATIONS.content is a terminated string
END FOR
```

**Property: Preservation Checking** — non-buggy behavior must be unchanged:

```pascal
// Property: Preservation Checking
FOR ALL symbol WHERE symbol IN {PSMC_INFO, MISSION, ACTIVITIES,
                                CONTACT_EMAIL, CONTACT_PHONE,
                                FINANCIAL_REPORTS, BOARD_LAST_UPDATED,
                                STATUTES.title, STATUTES.description,
                                REGULATIONS.title, REGULATIONS.description} DO
  ASSERT F(symbol) = F'(symbol)   // fixed value equals original intended value
END FOR
```

- **F**: the original (unfixed) `app/info/config.py` — currently unparseable.
- **F'**: the fixed module where both `content` strings are properly terminated.

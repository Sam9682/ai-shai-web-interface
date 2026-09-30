# Implementation Plan

- [x] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - Module Parses and Imports Cleanly
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate the bug exists (unterminated triple-quoted `content` strings in `app/info/config.py`)
  - **Scoped PBT Approach**: This is a deterministic parse failure, so scope the property to the single concrete failing input — the current text of `app/info/config.py`. The "for all sources where isBugCondition(source)" quantifier collapses to this one module source.
  - Test details from Bug Condition in design (`isBugCondition(source)` = `hasUnterminatedTripleQuotedString(source)`):
    - Byte-compile the unfixed module: run `python -m py_compile app/info/config.py`
    - Direct import: run `python -c "import app.info.config"`
    - Import chain: run `python -c "import app.main"` (propagates through `app.info.router` → `app.info.config`)
  - The test assertions should match the Expected Behavior Properties from design: after a fix, no `SyntaxError`, and `STATUTES.content` / `REGULATIONS.content` are terminated strings
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS with `SyntaxError: unterminated string literal (detected at line 71)` (this is correct - it proves the bug exists)
  - Document counterexamples found to understand root cause: missing closing `"""` on `STATUTES.content` (`STATUTS DE L'OPCP ... Article 3 - Durée`) and on `REGULATIONS.content` (`RÈGLEMENT INTÉRIEUR DE L'OPCP`), each absorbing the constructor's `)` and downstream code to EOF
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 1.1, 1.2, 1.3_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Other Symbols and Fields Unchanged
  - **IMPORTANT**: Follow observation-first methodology
  - **Constraint note**: The unfixed module cannot be imported at all (it is unparseable), so observed values are taken from the *intended, unambiguous literals* in the source rather than from a live import. Record these expected values now so the post-fix import can be asserted against them.
  - Observe / record the intended values for the non-bug-condition symbols (cases where `isBugCondition` returns false), from Preservation Requirements in design:
    - `PSMC_INFO`, `MISSION`, `ACTIVITIES`, `CONTACT_EMAIL`, `CONTACT_PHONE`, `FINANCIAL_REPORTS`, `BOARD_LAST_UPDATED` — existing values and types
    - `MISSION` and `ACTIVITIES` — already-terminated `"""` strings, content unchanged
    - `STATUTES.title`, `STATUTES.description`, `REGULATIONS.title`, `REGULATIONS.description` — unchanged
  - Write property-based tests capturing observed behavior patterns from Preservation Requirements: for the full set of preserved symbols, each imported value equals its recorded expected literal; assert `app.info.router` resolves the config symbols with the same names/types
  - Property-based testing generates many test cases across the symbol set for stronger guarantees; the property is "for all preserved symbols, F(symbol) = F'(symbol)"
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: Preservation assertions that depend on importing the module cannot run on the unfixed (unparseable) module — record this as the baseline. The literal-comparison expectations captured above form the baseline to preserve; they will be asserted against the live import in task 3.3.
  - Mark task complete when tests are written, expected values are recorded, and the baseline state is documented
  - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [x] 3. Fix for unterminated triple-quoted `content` strings in `app/info/config.py`

  - [x] 3.1 Implement the fix
    - Insert a closing `"""` on its own line immediately after the last line of `STATUTES.content` (`Article 3 - Durée`) and before that constructor's closing `)`
    - Insert a closing `"""` on its own line immediately after the last line of `REGULATIONS.content` (`RÈGLEMENT INTÉRIEUR DE L'OPCP`) and before that constructor's closing `)`
    - Do NOT alter the `title` or `description` arguments of either constructor, nor the existing text inside the `content` bodies
    - Do NOT edit `PSMC_INFO`, `MISSION`, `ACTIVITIES`, `CONTACT_EMAIL`, `CONTACT_PHONE`, `FINANCIAL_REPORTS`, `BOARD_LAST_UPDATED`, imports, or comments
    - _Bug_Condition: isBugCondition(source) = hasUnterminatedTripleQuotedString(source) — a LegalDocument content field opens a `"""` string never closed before the constructor's `)`_
    - _Expected_Behavior: expectedBehavior(result) — module parses/imports with no SyntaxError; STATUTES.content and REGULATIONS.content are terminated strings_
    - _Preservation: Preservation Requirements from design — all other symbols and the title/description fields of STATUTES and REGULATIONS remain unchanged_
    - _Requirements: 2.1, 2.2, 2.3_

  - [x] 3.2 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - Module Parses and Imports Cleanly
    - **IMPORTANT**: Re-run the SAME test from task 1 - do NOT write a new test
    - The test from task 1 encodes the expected behavior; when it passes it confirms the expected behavior is satisfied
    - Run the bug condition exploration checks from step 1:
      - `python -m py_compile app/info/config.py` — expect no `SyntaxError`
      - `python -c "import app.info.config"` — expect clean import; `STATUTES.content` and `REGULATIONS.content` are non-`None` `str` values
      - `python -c "import app.main"` — expect the full import chain (`app.main` → `app.info.router` → `app.info.config`) to load, allowing uvicorn to import the FastAPI app
    - **EXPECTED OUTCOME**: Test PASSES (confirms bug is fixed)
    - _Requirements: 2.1, 2.2, 2.3_

  - [x] 3.3 Verify preservation tests still pass
    - **Property 2: Preservation** - Other Symbols and Fields Unchanged
    - **IMPORTANT**: Re-run the SAME tests from task 2 - do NOT write new tests
    - Now that the module imports, assert each preserved symbol equals the expected literal recorded in task 2: `PSMC_INFO`, `MISSION`, `ACTIVITIES`, `CONTACT_EMAIL`, `CONTACT_PHONE`, `FINANCIAL_REPORTS`, `BOARD_LAST_UPDATED`
    - Assert `STATUTES.title`, `STATUTES.description`, `REGULATIONS.title`, `REGULATIONS.description` are unchanged
    - Assert `app.info.router` still imports and resolves the config symbols with the same names/types
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)
    - Confirm all tests still pass after fix (no regressions)
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [x] 4. Checkpoint - Ensure all tests pass
  - Confirm `python -m py_compile app/info/config.py` succeeds
  - Confirm `python -c "import app.info.config"` and `python -c "import app.main"` both import cleanly
  - Confirm the bug condition exploration test (Property 1) now passes and the preservation tests (Property 2) still pass
  - Ensure all tests pass, ask the user if questions arise
  - _Requirements: 1.1, 1.2, 1.3, 2.1, 2.2, 2.3, 3.1, 3.2, 3.3, 3.4_

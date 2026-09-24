# Implementation Plan

- [x] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - Formatting Renders Flattened At Display Time
  - **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples demonstrating that editor-produced formatting renders flattened on the non-`contenteditable` display container in `TopicDetailPage`, confirming the CSS-scoping root cause
  - **Scoped PBT Approach**: This is a deterministic rendering bug — scope the property to concrete failing fragments (one per formatting type) rather than randomizing, to guarantee reproducibility
  - Render `TopicDetailPage` (or the isolated post display container) with post `content` HTML for each formatting type from the Bug Condition in design (`containsFormatting`):
    - Heading: `<h1>Titre</h1>`
    - Unordered list: `<ul><li>a</li><li>b</li></ul>`
    - Image: `<img src="https://example.com/x.png">`
    - Horizontal rule: `<hr>`
  - Assert the display container carries the shared `rich-content` class and that the formatting rules apply to it (the assertions encode the Expected Behavior / Correctness Property 1 from design)
  - Root-cause confirmation: verify the `RichTextEditor` formatting rules are scoped to `[contenteditable]` and therefore do not match the non-`contenteditable` `prose prose-sm` display `<div>`
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS (this is correct - the display container lacks the `rich-content` class and the scoped rules do not apply, proving the bug exists)
  - Document counterexamples found (e.g. "`<h1>` in a post renders with no heading-level styling because `[contenteditable] h1` does not match the display container")
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Plain-Text And Unrelated Flows Unchanged
  - **IMPORTANT**: Follow observation-first methodology — observe behavior on UNFIXED code, then encode it
  - Observe on UNFIXED code and record the outputs for inputs where `isBugCondition` is false:
    - Plain-text post (no formatting) renders unchanged in the display container (3.1)
    - `MarkdownRenderer` output in the Oracle chat path is unchanged (3.4)
    - Topic title, author names, and timestamps display for authenticated and public users (3.3)
  - Write property-based test: generate random plain-text strings (including whitespace, punctuation, unicode/emoji) and assert the display output is identical before and after the fix (from Preservation Requirements in design)
  - Add example-based preservation checks: `MarkdownRenderer` rendering is byte-for-byte unchanged and `MarkdownRenderer.tsx` is not modified (3.4); forum service create/edit/delete persist and retrieve `content` with the same stored HTML format (3.2)
  - Run tests on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (this confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [x] 3. Fix for forum formatting not rendering at display time (CSS scoping)

  - [x] 3.1 Share the formatting stylesheet and apply it in the editor
    - In `frontend/src/components/RichTextEditor.tsx`, extract the formatting rules into a single shared source (a small `frontend/src/styles/richContent.css` imported by both surfaces, or a tiny exported `RichContentStyles` component — choose the minimal option that fits the project)
    - Retarget the selectors from `[contenteditable] h1/h2/h3`, `[contenteditable] ul/ol`, `[contenteditable] img`, `[contenteditable] hr` to also match `.rich-content h1/...` etc., covering headings, lists, images, and horizontal rules
    - Keep the `[contenteditable]:empty:before` placeholder rule scoped to the editor only (must not leak into the display view)
    - Add the `rich-content` class to the editor's editable `<div>` (alongside its existing `prose prose-sm max-w-none`)
    - _Bug_Condition: isBugCondition(X) = containsFormatting(X) AND renderedOutsideContentEditable(X) AND formattingStylesScopedToContentEditable_
    - _Expected_Behavior: displayPost'(X) renders formatting visibly and matches editor appearance (Correctness Property 1)_
    - _Preservation: Preservation Requirements from design — plain text, service flow, topic/author/timestamp, MarkdownRenderer unchanged_
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

  - [x] 3.2 Apply the shared class and styles on the display page
    - In `frontend/src/pages/TopicDetailPage.tsx`, add the `rich-content` class to the post display `<div>` that uses `dangerouslySetInnerHTML` (alongside its existing `text-sm text-gray-700 prose prose-sm max-w-none`)
    - Ensure the shared styles are loaded on the page (import the shared CSS or render `RichContentStyles`) so the rules exist when only viewing posts and the editor is not mounted
    - Do not change `dangerouslySetInnerHTML` usage or the stored HTML; do not modify `forumService.ts` or `MarkdownRenderer.tsx`
    - _Bug_Condition: isBugCondition(X) from design_
    - _Expected_Behavior: expectedBehavior — formatting visibly rendered on TopicDetailPage matching the editor_
    - _Preservation: forumService and MarkdownRenderer untouched (3.2, 3.4)_
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

  - [x] 3.3 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - Formatting Renders Consistently At Display Time
    - **IMPORTANT**: Re-run the SAME test from task 1 - do NOT write a new test
    - The test from task 1 encodes the expected behavior; when it passes it confirms formatting is rendered on `TopicDetailPage` and matches the editor
    - Run bug condition exploration test from step 1
    - **EXPECTED OUTCOME**: Test PASSES (confirms the bug is fixed)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

  - [x] 3.4 Verify preservation tests still pass
    - **Property 2: Preservation** - Plain-Text And Unrelated Flows Unchanged
    - **IMPORTANT**: Re-run the SAME tests from task 2 - do NOT write new tests
    - Run preservation property tests from step 2
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions — plain text, service flow, topic/author/timestamp, and Oracle chat rendering unchanged)
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [x] 4. Checkpoint - Ensure all tests pass
  - Run the frontend test suite and confirm the exploration test (now passing), the preservation tests, and any existing forum/editor/renderer tests all pass
  - Confirm `frontend/src/services/forumService.ts` and `frontend/src/components/MarkdownRenderer.tsx` are unmodified
  - Ensure all tests pass, ask the user if questions arise

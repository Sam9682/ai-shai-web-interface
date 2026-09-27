# Implementation Plan: Oracle Chat Formatting

## Overview

Replace the hand-rolled, regex-based `MarkdownRenderer` with the standard `react-markdown` / `remark` / `rehype` pipeline while preserving the public contract (`{ content: string }` prop, named export, `prose prose-sm max-w-none` container). Work proceeds bottom-up: pin and install dependencies, add the sanitization schema module, rewrite the renderer to compose the pipeline, add the new example + property test file, reconcile the pinned preservation test, then verify the full frontend build and test suite pass green.

Stack: React 19, Vite, TypeScript, Tailwind v4, Vitest + Testing Library + fast-check. Frontend-only change; `OraclePage.tsx` and all other callers are untouched.

## Tasks

- [x] 1. Set up dependencies
  - [x] 1.1 Add and install pinned markdown pipeline dependencies
    - Add to `frontend/package.json` `dependencies` with exact pinned versions: `react-markdown` `9.0.1`, `remark-gfm` `4.0.0`, `remark-breaks` `4.0.0`, `rehype-raw` `7.0.0`, `rehype-sanitize` `6.0.0`
    - Run the install in `frontend/` so the lockfile resolves transitive `unified`/`remark`/`rehype`/`hast` deps; if an exact pinned version is unavailable, select the nearest published patch within the same major and record it in the lockfile
    - Confirm the packages resolve as ESM under the project's `"type": "module"` / Vite setup
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 1.2_

- [x] 2. Create the sanitization schema module
  - [x] 2.1 Add `frontend/src/components/markdownSanitizeSchema.ts`
    - Export `markdownSanitizeSchema` built by spreading `defaultSchema` from `rehype-sanitize`
    - Inherit the default protocol allow-list unchanged so `javascript:` is excluded from `href`/`src` without extra config
    - Extend the default schema only where a needed Safe_HTML element/attribute is missing (e.g. keep `className` on `code`/`pre` for code/prose styling)
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [x] 3. Rewrite the MarkdownRenderer to use the react-markdown pipeline
  - [x] 3.1 Replace the internals of `frontend/src/components/MarkdownRenderer.tsx`
    - Render `<ReactMarkdown>` inside `<div className="prose prose-sm max-w-none">`
    - Set `remarkPlugins={[remarkGfm, remarkBreaks]}` and `rehypePlugins={[rehypeRaw, [rehypeSanitize, markdownSanitizeSchema]]}` (rehype-raw MUST precede rehype-sanitize)
    - Preserve the named export `MarkdownRenderer` and the single `{ content: string }` prop; remove the `renderMarkdown` regex function and any `dangerouslySetInnerHTML`
    - Empty `content` yields the container with no markdown body; leave `OraclePage.tsx` and all other callers unchanged
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 2.1, 2.2, 2.3, 4.1, 4.2, 4.3, 4.4_

- [x] 4. Author the MarkdownRenderer test suite (example + property tests)
  - [x] 4.1 Create `frontend/src/components/MarkdownRenderer.test.tsx` scaffold and example/edge tests
    - Set up Testing Library render helpers and fast-check import
    - Assert the named-export contract, the `prose prose-sm max-w-none` container, and empty-content → empty body edge case
    - Tag each property test `Feature: oracle-chat-formatting, Property {number}: {property_text}`; configure fast-check with a minimum of 100 iterations per property
    - _Requirements: 5.1, 4.2, 4.3, 4.4_

  - [x]* 4.2 Property test — blank-line-separated blocks become separate paragraphs
    - **Property 1: Blank-line-separated blocks become separate paragraphs**
    - **Validates: Requirements 1.1**

  - [x]* 4.3 Property test — single newline produces a line break within a paragraph
    - **Property 2: Single newline produces a line break within a paragraph**
    - **Validates: Requirements 1.2**

  - [x]* 4.4 Property test — unordered lists yield one list item per entry
    - **Property 3: Unordered lists yield one list item per entry** (one `<ul>`, N `<li>`, no literal `•`)
    - **Validates: Requirements 1.3**

  - [x]* 4.5 Property test — ordered lists yield one list item per entry
    - **Property 4: Ordered lists yield one list item per entry** (one `<ol>`, N `<li>`)
    - **Validates: Requirements 1.4**

  - [x]* 4.6 Property test — heading markers map to the corresponding heading level
    - **Property 5: Heading markers map to the corresponding heading level** (levels 1–3 → `<h1>`/`<h2>`/`<h3>`)
    - **Validates: Requirements 1.5**

  - [x]* 4.7 Property test — double-asterisk text becomes strong
    - **Property 6: Double-asterisk text becomes strong**
    - **Validates: Requirements 1.6**

  - [x]* 4.8 Property test — single-backtick text becomes inline code
    - **Property 7: Single-backtick text becomes inline code** (a `<code>` not nested inside `<pre>`)
    - **Validates: Requirements 1.7**

  - [x]* 4.9 Property test — fenced blocks become preformatted code
    - **Property 8: Fenced blocks become preformatted code** (`<pre>` containing `<code>`)
    - **Validates: Requirements 1.8**

  - [x]* 4.10 Property test — streaming tolerates incomplete input without error
    - **Property 9: Streaming tolerates incomplete input without error** (rendering any prefix never throws)
    - **Validates: Requirements 2.2**

  - [x]* 4.11 Property test — incremental rendering equals single-pass rendering
    - **Property 10: Incremental rendering equals single-pass rendering** (growing prefixes then full string equals a single fresh mount)
    - **Validates: Requirements 2.1, 2.3**

  - [x]* 4.12 Property test — safe HTML is preserved
    - **Property 11: Safe HTML is preserved** (permitted element set survives)
    - **Validates: Requirements 3.1**

  - [x]* 4.13 Property test — script elements are excluded
    - **Property 12: Script elements are excluded** (no `<script>` and none of its executable contents)
    - **Validates: Requirements 3.2**

  - [x]* 4.14 Property test — event-handler attributes are excluded
    - **Property 13: Event-handler attributes are excluded** (no `on*` attribute retained)
    - **Validates: Requirements 3.3**

  - [x]* 4.15 Property test — `javascript:` URLs are excluded
    - **Property 14: `javascript:` URLs are excluded** (no anchor/image retains a `javascript:` URL)
    - **Validates: Requirements 3.4**

  - [x]* 4.16 Property test — the prose container is always present
    - **Property 15: The prose container is always present** (outer element carries exactly `prose prose-sm max-w-none`)
    - **Validates: Requirements 4.2**

- [x] 5. Checkpoint - Ensure MarkdownRenderer tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Reconcile the pinned preservation test
  - [x] 6.1 Update the MarkdownRenderer block in `frontend/src/pages/TopicDetailPage.preservation.test.tsx`
    - Replace the byte-for-byte OLD-renderer `MARKDOWN_CASES` `innerHTML` assertions with structural assertions matching the new contract: plain text → `.prose` `textContent` equals input; `a **bold** b` → a `<strong>` with text `bold`; inline code → a `<code>` (not in `<pre>`) with text `npm run`; `# Title` → an `<h1>` with text `Title`; `- item` → one `<ul>` with exactly one `<li>` text `item` and no literal `•`; `a\nb` → one `<p>` containing a `<br>`
    - Remove the `expect(fingerprint).toBe(1073)` non-whitespace character-count pin and the `expect(source).toContain('renderMarkdown')` assertion
    - Keep asserting the source contains `prose prose-sm max-w-none` and does NOT contain `rich-content` (optionally assert it references `react-markdown`; do not re-introduce a byte-count pin)
    - Leave every unrelated block untouched: forum plain-text 3.1, topic/author/timestamp 3.3, and the forumService flow 3.2 including the `forumService.ts` fingerprint `=== 1726`
    - _Requirements: 5.3_

- [x] 7. Final checkpoint - Verify build and full suite
  - [x] 7.1 Run the frontend build/typecheck and the full Vitest suite
    - Run the TypeScript typecheck / Vite build and the complete `frontend` Vitest suite (single run, not watch mode)
    - Fix any type errors or failures so the entire suite passes green; clean up any temporary files
    - _Requirements: 5.1, 5.2, 5.3_

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP, but they encode the 15 correctness properties and the Requirement 5.1/5.2 test coverage, so they are strongly recommended.
- Each task references specific requirement acceptance criteria for traceability.
- Checkpoints ensure incremental validation before moving on.
- Property tests validate the universal structural and security properties; the example/edge tests in 4.1 cover the named-export contract, container class, and empty-content case.
- Plugin order is a hard requirement: `rehype-raw` must precede `rehype-sanitize` so raw HTML cannot bypass sanitization.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["2.1"] },
    { "id": 2, "tasks": ["3.1"] },
    { "id": 3, "tasks": ["4.1", "6.1"] },
    { "id": 4, "tasks": ["4.2", "4.3", "4.4", "4.5", "4.6", "4.7", "4.8", "4.9", "4.10", "4.11", "4.12", "4.13", "4.14", "4.15", "4.16"] },
    { "id": 5, "tasks": ["7.1"] }
  ]
}
```

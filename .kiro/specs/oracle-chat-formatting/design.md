# Design Document

## Overview

This feature replaces the internals of `frontend/src/components/MarkdownRenderer.tsx`. The current implementation is a hand-rolled, regex-based renderer that injects a single flat HTML string through `dangerouslySetInnerHTML`. It never wraps paragraphs in `<p>`, never groups `<li>` items inside `<ul>`/`<ol>`, converts newlines into naked `<br/>`, renders list bullets as literal `•` characters, and performs no HTML escaping or sanitization.

The new implementation composes the standard `unified`/`remark`/`rehype` React pipeline:

- **`react-markdown`** — renders markdown to a React element tree (a virtual DOM), so React re-renders only what changed between streaming updates rather than replacing the whole subtree.
- **`remark-gfm`** — GitHub Flavored Markdown: proper unordered/ordered lists, tables, strikethrough, autolinks.
- **`remark-breaks`** — maps a single newline inside a paragraph to a hard line break (`<br>`), matching Requirement 1.2 (Oracle answers use single newlines for intra-paragraph breaks).
- **`rehype-raw`** — re-parses raw/embedded HTML found in the markdown into real hast nodes so Safe_HTML can render (Requirement 3.1).
- **`rehype-sanitize`** — runs after `rehype-raw` and strips anything not permitted by the schema: `<script>` elements, `on*` event-handler attributes, and `javascript:` URLs (Requirements 3.2–3.4).

The public contract is unchanged: a named export `MarkdownRenderer`, a single `{ content: string }` prop, and an outer container carrying exactly `prose prose-sm max-w-none`. `OraclePage.tsx` (`<MarkdownRenderer content={message.content} />`) requires no change, and neither do any other callers.

The change is frontend-only. No backend, no API, no `OraclePage` edits.

## Architecture

```
message.content (string, possibly streaming)
        │
        ▼
┌─────────────────────────────────────────────┐
│ MarkdownRenderer                              │
│   <div className="prose prose-sm max-w-none"> │  ← Prose_Container (4.2)
│     <ReactMarkdown                            │
│       remarkPlugins={[remarkGfm, remarkBreaks]}
│       rehypePlugins={[rehypeRaw,              │
│                       [rehypeSanitize, schema]]}
│     >{content}</ReactMarkdown>                │
│   </div>                                      │
└─────────────────────────────────────────────┘
        │
        ▼
  markdown → mdast (remark parse)
        │  remark-gfm, remark-breaks
        ▼
  mdast → hast (remark-rehype)
        │  rehype-raw     (parse embedded HTML into hast)
        │  rehype-sanitize(strip script / on* / javascript:)   ← MUST run last
        ▼
  hast → React elements  (semantic <p>, <ul>, <ol>, <li>, <h1..3>, <strong>, <code>, <pre>, <a>)
```

Plugin order matters and is a hard requirement: `rehype-raw` must precede `rehype-sanitize`, otherwise raw HTML would bypass sanitization. Sanitization is the last transform before React elements are produced.

### Why not keep `dangerouslySetInnerHTML`

`react-markdown` builds a React element tree instead of setting inner HTML, which (a) enables efficient incremental re-render during streaming, (b) removes the XSS surface of the old renderer, and (c) produces correct nesting (`<ul><li>…`) that the old regex could not.

## Components and Interfaces

### `MarkdownRenderer` (replaced)

Public interface — unchanged:

```typescript
interface MarkdownRendererProps {
  content: string;
}

export const MarkdownRenderer = ({ content }: MarkdownRendererProps) => { /* ... */ };
```

Implementation shape (TypeScript / React 19):

```tsx
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import { markdownSanitizeSchema } from './markdownSanitizeSchema';

interface MarkdownRendererProps {
  content: string;
}

export const MarkdownRenderer = ({ content }: MarkdownRendererProps) => {
  return (
    <div className="prose prose-sm max-w-none">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        rehypePlugins={[rehypeRaw, [rehypeSanitize, markdownSanitizeSchema]]}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};
```

Notes:
- The outer `<div>` keeps the literal class string `prose prose-sm max-w-none` (Requirement 4.2). Body styling comes from the `@tailwindcss/typography` `prose` classes already used, so per-element Tailwind classes from the old regex output are no longer needed.
- An empty `content` string yields the container with no markdown body (Requirement 4.3) — `react-markdown` renders nothing for an empty string.
- No `dangerouslySetInnerHTML` anywhere.

### Sanitization schema — `markdownSanitizeSchema`

`rehype-sanitize` ships a `defaultSchema` (based on GitHub's allow-list) that already permits paragraphs, lists, headings, emphasis, `code`/`pre`, and links, and already:
- drops `<script>` (Requirement 3.2),
- drops `on*` event-handler attributes (Requirement 3.3),
- restricts `href`/`src` protocols to a safe set that excludes `javascript:` (Requirement 3.4).

The design extends the default schema only if a verification run shows a needed Safe_HTML element/attribute is missing (e.g. keeping `className` on `code`/`pre` for syntax styling). The schema lives in its own small module so it is testable and reviewable:

```typescript
// markdownSanitizeSchema.ts
import { defaultSchema } from 'rehype-sanitize';

export const markdownSanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    // keep language class on code fences for prose/code styling
    code: [...(defaultSchema.attributes?.code ?? []), ['className']],
  },
  // protocols inherited from defaultSchema already exclude `javascript:`
};
```

The default protocol allow-list is inherited unchanged so `javascript:` URLs in `href`/`src` are stripped without extra configuration.

## Data Models

There is no persistent data model. The only data is the `content: string` prop, which flows through the transform pipeline described above. No shape changes are introduced for `OraclePage`, `oracleService`, or any message type.

## Dependencies

Add to `frontend/package.json` `dependencies` (no markdown or sanitizer library is currently installed). Versions are pinned to current stable majors compatible with React 19 / Vite / TypeScript / Tailwind v4:

| Package           | Pinned version | Purpose                                             |
|-------------------|----------------|-----------------------------------------------------|
| `react-markdown`  | `9.0.1`        | Markdown → React element tree                       |
| `remark-gfm`      | `4.0.0`        | GFM lists/tables/strikethrough/autolinks            |
| `remark-breaks`   | `4.0.0`        | Single newline → hard line break (Requirement 1.2)  |
| `rehype-raw`      | `7.0.0`        | Parse embedded/raw HTML into hast (Requirement 3.1) |
| `rehype-sanitize` | `6.0.0`        | Strip script/`on*`/`javascript:` (Reqs 3.2–3.4)     |

These are ESM packages and align with the project's `"type": "module"` and Vite bundling. They bring transitive `unified`/`remark`/`rehype`/`hast` dependencies, resolved by the lockfile. If the exact pinned version is unavailable at install time, select the nearest published patch within the same major and record it in the lockfile; the majors above are the contract.

## Streaming Behavior

`OraclePage` updates `message.content` incrementally as tokens arrive; each update is a new `content` prop value (a Streaming_Update).

- **Re-render (2.1):** `react-markdown` re-parses the new `content` and updates the React element tree; React reconciles only changed nodes. No local state or memo is required for correctness. (An optional `useMemo` keyed on `content` is a performance nicety, not a correctness need, and is out of scope.)
- **Incomplete tail (2.2):** markdown parsing is total — remark parses any string, including one ending mid-construct (an unclosed `**`, a half-typed fenced block, a dangling `[`). It produces a best-effort tree rather than throwing. `rehype-raw` + `rehype-sanitize` likewise operate on whatever tree exists. The renderer therefore shows the available content and never raises during streaming.
- **Final equals single-pass (2.3):** the pipeline is a pure function of `content` — output is determined solely by the current prop value, not by the sequence of prior values. Rendering the final string after N incremental updates yields the same DOM as mounting fresh with that final string. This is the equivalence the tests assert.

## Error Handling

- **Malformed / partial markdown:** handled by the parser's total behavior (see 2.2); no try/catch needed for the common case.
- **Dangerous content:** neutralized structurally by `rehype-sanitize` rather than by ad-hoc escaping — script elements, event-handler attributes, and `javascript:` URLs are removed from the tree before React renders it.
- **Empty content:** renders the Prose_Container with no body (4.3); no special-casing required.
- **Defensive boundary (optional):** because the pipeline is total for string input and the prop type is `string`, an error boundary is not required for correctness. If future callers might pass non-string values, that is a type-contract violation caught by TypeScript, not a runtime concern this component guards.

## Reconciling the Pinned Preservation Test (Requirement 5.3)

`frontend/src/pages/TopicDetailPage.preservation.test.tsx` contains a block titled **"Property 2 (Preservation): MarkdownRenderer output unchanged (3.4)"** written against the OLD regex renderer. Replacing the renderer necessarily invalidates two things in that block:

1. **Byte-for-byte `innerHTML` assertions** (`MARKDOWN_CASES`): these assert the old flat output, e.g. `a <strong class="font-bold">bold</strong> b`, `<li class="ml-4">• item</li>`, `a<br>b`, and plain text rendered verbatim without a `<p>` wrapper. The new renderer emits semantic, `prose`-styled structure instead — bold becomes `<strong>bold</strong>` (no `font-bold` class), a list item becomes `<ul><li>item</li></ul>` (no literal `•`), text becomes a `<p>`-wrapped paragraph, and a single newline becomes a `<br>` inside a `<p>`. The old byte-for-byte expectations can no longer hold.
2. **Source fingerprint / content pin** (`MarkdownRenderer.tsx source is not modified by the fix`): asserts the non-whitespace character count `=== 1073`, that the source contains `renderMarkdown`, contains `prose prose-sm max-w-none`, and does not contain `rich-content`. The rewrite deletes the `renderMarkdown` function and changes the byte count, so the `1073` fingerprint and the `renderMarkdown` substring check are no longer valid.

### Reconciliation approach

Update **only** that block to reflect the new renderer contract, and leave every unrelated assertion in the file untouched.

**Replace the byte-for-byte cases with structural assertions** that encode the new contract (these mirror the Requirement 1 properties):

- plain text → the `.prose` container's `textContent` equals the input (wrapped in a `<p>`).
- bold `a **bold** b` → contains a `<strong>` whose text is `bold`.
- inline code `use \`npm run\`` → contains a `<code>` (not inside `<pre>`) whose text is `npm run`.
- `# Title` → contains an `<h1>` whose text is `Title`.
- `- item` → contains a `<ul>` with exactly one `<li>` whose text is `item` (and no literal `•`).
- `a\nb` → the single `<p>` contains a `<br>`.

**Replace the source fingerprint pin** with contract-level assertions that survive the rewrite:

- keep asserting the source contains `prose prose-sm max-w-none` (the container class is preserved — Requirement 4.2);
- keep asserting the source does **not** contain `rich-content`;
- remove the `expect(fingerprint).toBe(1073)` assertion and the `expect(source).toContain('renderMarkdown')` assertion, since both are tied to the deleted regex implementation. (Optionally assert the source references `react-markdown` to pin the new contract, but do not re-introduce a brittle byte count.)

**Preserve untouched** (these are unrelated to the renderer swap and must keep passing):

- `Property 2 (Preservation): plain-text posts render unchanged (3.1)` — forum `dangerouslySetInnerHTML` plain-text path.
- `Property 2 (Preservation): topic/author/timestamp display (3.3)`.
- `Property 2 (Preservation): forum service flow unchanged (3.2)` — including the `forumService.ts` fingerprint `=== 1726` (forumService is not modified by this feature).

This keeps the suite green while accurately describing the replaced implementation.

## Testing Strategy

### Dual approach
- **Property tests** (fast-check, already a dependency, ≥100 iterations) validate the universal structural and security properties below.
- **Example/edge tests** cover empty content, the named-export contract, and specific fixed markdown samples for readability.

### New file: `frontend/src/components/MarkdownRenderer.test.tsx`
Covers Requirement 5.1 and 5.2:
- **Paragraph separation** — blank-line-separated blocks → two `<p>` (Property 1).
- **Line breaks** — single newline → `<br>` inside one `<p>` (Property 2).
- **Unordered list** — `-`/`*` items → one `<ul>`, N `<li>` (Property 3).
- **Ordered list** — `1.` items → one `<ol>`, N `<li>` (Property 4).
- **Headings** — `#`/`##`/`###` → `<h1>`/`<h2>`/`<h3>` (Property 5).
- **Bold** — `**x**` → `<strong>` (Property 6).
- **Inline code** — `` `x` `` → inline `<code>` (Property 7).
- **Code block** — fenced ``` → `<pre><code>` (Property 8).
- **Streaming** — incremental prefixes never throw and final equals single-pass (Properties 9, 10).
- **XSS exclusion** — `<script>`, `on*` attributes, and `javascript:` URLs are stripped; Safe_HTML survives (Properties 11–14).
- **Container / empty** — outer `prose prose-sm max-w-none`; empty string → empty body (Property 15, edge case 4.3).

### Reconciled file: `frontend/src/pages/TopicDetailPage.preservation.test.tsx`
Updated per the reconciliation section (Requirement 5.3): the MarkdownRenderer block becomes structural + container-class assertions; unrelated blocks stay as-is.

### Property test configuration
- fast-check, minimum 100 iterations per property.
- Each property test tagged: `Feature: oracle-chat-formatting, Property {number}: {property_text}`.
- Generators avoid characters that would themselves introduce markdown/HTML constructs when the test asserts a specific structure (e.g. list-item text excludes newlines, backticks, and `<`), while the XSS and robustness properties deliberately generate hostile/partial input.

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Blank-line-separated blocks become separate paragraphs

*For any* two non-empty single-line text blocks joined by a blank line, rendering the combined string produces exactly two `<p>` elements, each containing its corresponding block text.

**Validates: Requirements 1.1**

### Property 2: Single newline produces a line break within a paragraph

*For any* two non-empty single-line texts joined by a single newline, rendering produces one `<p>` element containing a `<br>` between the two texts.

**Validates: Requirements 1.2**

### Property 3: Unordered lists yield one list item per entry

*For any* list of N (N ≥ 1) non-empty items using a `-` or `*` marker, rendering produces exactly one `<ul>` element containing exactly N `<li>` elements, one per item, with no literal bullet character in the item text.

**Validates: Requirements 1.3**

### Property 4: Ordered lists yield one list item per entry

*For any* list of N (N ≥ 1) items using `1.`-style markers, rendering produces exactly one `<ol>` element containing exactly N `<li>` elements, one per item.

**Validates: Requirements 1.4**

### Property 5: Heading markers map to the corresponding heading level

*For any* heading level L in {1, 2, 3} and any non-empty single-line text, rendering `("#" repeated L) + " " + text` produces an `<hL>` element containing that text.

**Validates: Requirements 1.5**

### Property 6: Double-asterisk text becomes strong

*For any* non-empty text containing no `*`, rendering that text wrapped in `**` produces a `<strong>` element containing the text.

**Validates: Requirements 1.6**

### Property 7: Single-backtick text becomes inline code

*For any* non-empty text containing no backtick, rendering that text wrapped in single backticks produces a `<code>` element (not nested inside a `<pre>`) containing the text.

**Validates: Requirements 1.7**

### Property 8: Fenced blocks become preformatted code

*For any* non-empty block body containing no triple-backtick sequence, rendering it wrapped in a triple-backtick fence produces a `<pre>` element containing a `<code>` element whose text is the block body.

**Validates: Requirements 1.8**

### Property 9: Streaming tolerates incomplete input without error

*For any* markdown string and any prefix of that string, rendering the prefix completes without raising an error.

**Validates: Requirements 2.2**

### Property 10: Incremental rendering equals single-pass rendering

*For any* markdown string, rendering it via a sequence of growing prefixes (as during streaming) and then reaching the full string produces output equivalent to mounting the component once with the full string; the final rendered output reflects the current value of the `content` prop.

**Validates: Requirements 2.1, 2.3**

### Property 11: Safe HTML is preserved

*For any* Safe_HTML element drawn from the permitted set (paragraph, list, heading, emphasis, code, link), embedding it in the content renders the corresponding element in the output.

**Validates: Requirements 3.1**

### Property 12: Script elements are excluded

*For any* content containing a `<script>` element with an arbitrary payload at any position, the rendered output contains no `<script>` element and none of the script's executable contents.

**Validates: Requirements 3.2**

### Property 13: Event-handler attributes are excluded

*For any* content containing an element with an arbitrary `on*` event-handler attribute, no rendered element retains that event-handler attribute.

**Validates: Requirements 3.3**

### Property 14: `javascript:` URLs are excluded

*For any* content containing a link or image whose URL uses the `javascript:` scheme, no rendered anchor or image retains a `javascript:` URL.

**Validates: Requirements 3.4**

### Property 15: The prose container is always present

*For any* `content` string, the outer container element carries exactly the Tailwind classes `prose prose-sm max-w-none`.

**Validates: Requirements 4.2**

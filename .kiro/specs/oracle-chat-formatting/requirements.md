# Requirements Document

## Introduction

On the AI Oracle page (`frontend/src/pages/OraclePage.tsx`), assistant answers currently render as one dense block without proper line breaks, paragraphs, or lists, which makes long answers hard to read. The root cause is `frontend/src/components/MarkdownRenderer.tsx`, a hand-rolled regex-based renderer that uses `dangerouslySetInnerHTML` and does not wrap list items, separate paragraphs, or escape HTML.

This feature replaces the hand-rolled renderer with a proven markdown library (`react-markdown` + `remark-gfm`) and safe HTML handling (`rehype-raw` + `rehype-sanitize`). The change is frontend only. The `MarkdownRenderer` component's public API (`{ content: string }`) and its outer `prose prose-sm max-w-none` Tailwind styling are preserved so that `OraclePage.tsx` requires no change. Rendering must produce correctly structured output both while the answer streams in token by token and after the answer completes, with no cross-site scripting (XSS) regressions.

## Glossary

- **Markdown_Renderer**: The React component exported from `frontend/src/components/MarkdownRenderer.tsx` that accepts a `content` string prop and renders it as formatted HTML.
- **Oracle_Page**: The React page component in `frontend/src/pages/OraclePage.tsx` that displays assistant answers using the Markdown_Renderer.
- **Markdown_Content**: A string of markdown-formatted text passed to the Markdown_Renderer via the `content` prop.
- **Streaming_Update**: A change to the `content` prop that occurs while an assistant answer is being received incrementally, one or more tokens at a time.
- **Safe_HTML**: HTML elements and attributes permitted by the sanitization policy (for example paragraphs, lists, headings, emphasis, code, and links) that cannot execute scripts.
- **Dangerous_HTML**: HTML constructs capable of executing code or exfiltrating data, including `<script>` elements, event-handler attributes such as `onclick`, and `javascript:` URLs.
- **Prose_Container**: The outer wrapper element rendered by the Markdown_Renderer carrying the Tailwind classes `prose prose-sm max-w-none`.

## Requirements

### Requirement 1: Correct Markdown Structure Rendering

**User Story:** As an Oracle user, I want assistant answers to render with correct markdown structure, so that I can read paragraphs, lists, and headings clearly instead of one dense block.

#### Acceptance Criteria

1. WHEN Markdown_Content containing two blocks of text separated by a blank line is rendered, THE Markdown_Renderer SHALL produce two separate paragraph (`<p>`) elements.
2. WHEN Markdown_Content contains a single newline within a paragraph, THE Markdown_Renderer SHALL render a line break within that paragraph.
3. WHEN Markdown_Content contains an unordered list using `-` or `*` markers, THE Markdown_Renderer SHALL produce a `<ul>` element containing one `<li>` element per list item.
4. WHEN Markdown_Content contains an ordered list using `1.` style markers, THE Markdown_Renderer SHALL produce an `<ol>` element containing one `<li>` element per list item.
5. WHEN Markdown_Content contains heading markers `#`, `##`, or `###`, THE Markdown_Renderer SHALL produce the corresponding `<h1>`, `<h2>`, or `<h3>` element.
6. WHEN Markdown_Content contains text wrapped in `**`, THE Markdown_Renderer SHALL produce a bold (`<strong>`) element containing that text.
7. WHEN Markdown_Content contains text wrapped in single backticks, THE Markdown_Renderer SHALL produce an inline `<code>` element containing that text.
8. WHEN Markdown_Content contains a fenced code block delimited by triple backticks, THE Markdown_Renderer SHALL produce a `<pre>` element containing a `<code>` element with the block contents.

### Requirement 2: Streaming Rendering Correctness

**User Story:** As an Oracle user, I want answers to format correctly as they stream in, so that partial answers remain readable during generation and stay correct once complete.

#### Acceptance Criteria

1. WHEN the `content` prop receives a Streaming_Update, THE Markdown_Renderer SHALL re-render the formatted output reflecting the current value of the `content` prop.
2. WHILE Markdown_Content ends with an incomplete markdown construct during streaming, THE Markdown_Renderer SHALL render the available content without raising an error.
3. WHEN streaming completes and the final Markdown_Content is rendered, THE Markdown_Renderer SHALL produce output equivalent to rendering that same final Markdown_Content in a single pass.

### Requirement 3: HTML Sanitization and XSS Prevention

**User Story:** As a security-conscious operator, I want embedded HTML to be sanitized, so that assistant content cannot execute scripts or introduce XSS.

#### Acceptance Criteria

1. WHEN Markdown_Content contains Safe_HTML, THE Markdown_Renderer SHALL render the corresponding Safe_HTML elements.
2. IF Markdown_Content contains a `<script>` element, THEN THE Markdown_Renderer SHALL exclude the `<script>` element and its executable contents from the rendered output.
3. IF Markdown_Content contains an inline event-handler attribute such as `onclick`, THEN THE Markdown_Renderer SHALL exclude that attribute from the rendered output.
4. IF Markdown_Content contains a `javascript:` URL in a link or image, THEN THE Markdown_Renderer SHALL exclude that URL from the rendered output.

### Requirement 4: Preserved Component API and Styling

**User Story:** As a developer, I want the component API and styling preserved, so that the Oracle page and other callers require no changes.

#### Acceptance Criteria

1. THE Markdown_Renderer SHALL accept a single `content` prop of type `string`.
2. THE Markdown_Renderer SHALL render a Prose_Container carrying the Tailwind classes `prose prose-sm max-w-none`.
3. WHERE the `content` prop is an empty string, THE Markdown_Renderer SHALL render the Prose_Container without rendered markdown body content.
4. THE Markdown_Renderer SHALL remain importable as the named export `MarkdownRenderer` from `frontend/src/components/MarkdownRenderer.tsx`.

### Requirement 5: Test Coverage and Preservation-Test Reconciliation

**User Story:** As a maintainer, I want the replacement covered by tests and existing pinned tests reconciled, so that the change is verifiable and the suite stays green.

#### Acceptance Criteria

1. THE Markdown_Renderer test suite SHALL verify paragraph separation, line breaks, ordered lists, unordered lists, headings, bold text, inline code, and code blocks.
2. THE Markdown_Renderer test suite SHALL verify that Dangerous_HTML is excluded from rendered output.
3. IF an existing test pins the byte length or source contents of `frontend/src/components/MarkdownRenderer.tsx` (as in `frontend/src/pages/TopicDetailPage.preservation.test.tsx`), THEN THE updated test suite SHALL reconcile that expectation with the replaced implementation so that the full suite passes.

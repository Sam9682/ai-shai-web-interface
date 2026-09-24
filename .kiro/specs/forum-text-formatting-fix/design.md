# Forum Text Formatting Fix Bugfix Design

## Overview

Forum posts are composed with `RichTextEditor`, which produces an HTML string using `document.execCommand`. That HTML is persisted verbatim by `forumService` and later rendered on `TopicDetailPage` via `dangerouslySetInnerHTML`. While composing, the formatting looks correct because `RichTextEditor` ships a scoped `<style>` block that targets `[contenteditable] h1/h2/h3`, `[contenteditable] ul/ol`, `[contenteditable] img`, and `[contenteditable] hr`. At display time the same HTML is placed inside a plain `<div class="prose prose-sm">` that is **not** a `contenteditable` element, so those scoped rules never match. Headings, lists, images, and horizontal rules render flattened, and the displayed post no longer matches what the author saw in the editor.

The fix is minimal and CSS-scoped: extract the formatting rules into a single shared stylesheet that applies to a common class (e.g. `.rich-content`) rather than only to `[contenteditable]`, and apply that class both inside the editor and around the display container. Inline tags (`b/i/u/strike`) and alignment (inline `style="text-align:..."` produced by execCommand) already carry their own presentation and continue to render; the shared block covers the block-level and semantic elements that currently depend on scoped CSS. No storage format changes, no service changes, and `MarkdownRenderer` (Oracle chat) is untouched.

## Glossary

- **Bug_Condition (C)**: The condition that triggers the bug — a stored forum post whose `content` HTML carries editor-produced formatting (inline tags, headings, lists, alignment, images, or horizontal rules) that renders flattened at display time because the editor's formatting styles are scoped to `[contenteditable]` and do not apply to the display container.
- **Property (P)**: The desired behavior — when such a post is displayed on `TopicDetailPage`, the formatting is visibly rendered and matches how it appeared in the editor.
- **Preservation**: Plain-text posts, the forum service persistence/retrieval flow, topic/author/timestamp display, and `MarkdownRenderer` usage in the Oracle chat must remain unchanged.
- **RichTextEditor**: The component in `frontend/src/components/RichTextEditor.tsx` that composes post content and defines the current `[contenteditable]`-scoped formatting styles.
- **TopicDetailPage**: The page in `frontend/src/pages/TopicDetailPage.tsx` that renders stored post content via `dangerouslySetInnerHTML` inside a `prose prose-sm` container.
- **forumService**: The service in `frontend/src/services/forumService.ts` that stores and retrieves post `content` as an opaque HTML string.
- **MarkdownRenderer**: The component in `frontend/src/components/MarkdownRenderer.tsx` used by the Oracle chat (not the forum) — must remain unchanged (Requirement 3.4).
- **rich-content class**: The proposed shared CSS class applied to both the editor surface and the display container so a single stylesheet governs formatting in both contexts.

## Bug Details

### Bug Condition

The bug manifests when a stored forum post's `content` HTML contains editor-produced formatting — specifically block-level or semantic markup (`h1/h2/h3`, `ul/ol`, `img`, `hr`) or alignment — and that content is rendered on `TopicDetailPage`. The display container renders the raw HTML but is **not** a `contenteditable` element, so the `RichTextEditor` styles scoped to `[contenteditable] ...` never match. The formatting that looked correct while editing appears flattened when the post is viewed.

**Formal Specification:**
```
FUNCTION isBugCondition(X)
  INPUT: X of type ForumPostContent   // the stored HTML string of a post
  OUTPUT: boolean

  RETURN containsFormatting(X)
         AND renderedOutsideContentEditable(X)
         AND formattingStylesScopedToContentEditable

  // containsFormatting(X) is true when X carries any of:
  //   - inline tags:      <b> <i> <u> <strike>/<s>
  //   - headings:         <h1> <h2> <h3>
  //   - lists:            <ul> <ol> <li>
  //   - alignment:        inline style text-align: left|center|right
  //   - media/separators: <img> <hr>
END FUNCTION
```

### Examples

- **Heading**: Author applies H1 to "Annonce". Editor shows large bold text (via `[contenteditable] h1`). Displayed post shows plain-size text because `.prose` container is not `[contenteditable]`. Expected: rendered as a level‑1 heading.
- **Unordered list**: Author creates a bullet list of three items. Editor shows indented bullets (via `[contenteditable] ul`). Displayed post shows the items with no bullets/indentation (browser UA list styling is often reset by the surrounding layout). Expected: rendered as a bulleted list.
- **Image**: Author inserts an image URL. Editor shows it constrained to container width with rounded corners (via `[contenteditable] img`). Displayed post shows an unstyled, potentially overflowing image. Expected: rendered constrained with the same styling.
- **Horizontal rule**: Author inserts a separator. Editor shows a 2px gray rule with vertical margin (via `[contenteditable] hr`). Displayed post shows a default thin rule or none. Expected: rendered as the styled separator.
- **Edge case — inline only**: Author bolds a word (`<b>`). This may already render at display time because `<b>` carries intrinsic weight, but the appearance must remain consistent with the editor. Expected: bold text rendered.
- **Edge case — plain text**: Author submits unformatted text. `containsFormatting` is false → NOT a bug condition. Expected: displayed unchanged (preservation).

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Plain-text posts with no formatting must continue to display exactly as before (Requirement 3.1).
- Post create/edit/delete must continue to persist and retrieve `content` through the existing forum service endpoints, with the same stored HTML string format (Requirement 3.2).
- Topic title, posts, author names, and timestamps must continue to display for authenticated and public users as before (Requirement 3.3).
- `MarkdownRenderer` and its use in the Oracle chat must render exactly as before — it is not part of the forum path and must not be modified (Requirement 3.4).

**Scope:**
All inputs where `isBugCondition` is false must be completely unaffected by this fix. This includes:
- Plain-text-only posts.
- The forum service request/response payloads and stored content format.
- Non-forum rendering paths, in particular `MarkdownRenderer` in the Oracle chat.

**Note:** The actual expected correct rendering behavior is defined in the Correctness Properties section (Property 1). This section focuses on what must NOT change.

## Hypothesized Root Cause

Based on the code and bug description, the cause is a CSS scoping mismatch, not a data or persistence problem:

1. **Scoped formatting styles (primary)**: `RichTextEditor` defines its formatting rules under the `[contenteditable] ...` selector. The editor `<div>` is `contenteditable`, so the rules apply while composing. The display container on `TopicDetailPage` is a normal `<div>` (`prose prose-sm`) rendered with `dangerouslySetInnerHTML`; it is not `contenteditable`, so none of the heading/list/image/hr rules match. This alone explains 2.2, 2.3, and 2.5.

2. **Styles are not shared**: The formatting CSS lives inside the editor component only. The display view has no equivalent stylesheet, so block-level and semantic formatting has nothing to style it. Duplicating the rules would work but risks drift; sharing them is preferable.

3. **`.prose` expectations vs. UA styles**: The display container relies on Tailwind Typography (`prose`) semantics, but the editor styling was authored independently, so headings/lists do not match the editor even where `prose` applies. The fix must make display match the editor specifically.

4. **Inline vs. block distinction**: Inline tags (`<b>/<i>/<u>/<strike>`) and alignment (`style="text-align:..."`) carry intrinsic/inline presentation and may already render; the visible gap is concentrated in block/semantic elements that depended on the scoped stylesheet. The fix must cover the block/semantic set while leaving inline behavior consistent.

## Correctness Properties

Property 1: Bug Condition - Formatting Renders Consistently At Display Time

_For any_ forum post content where the bug condition holds (`isBugCondition` returns true — the content carries inline formatting, headings, lists, alignment, images, or horizontal rules), the fixed display path SHALL render that formatting visibly on `TopicDetailPage`, and the rendered appearance SHALL match how the same content appears inside `RichTextEditor` while composing.

**Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6**

Property 2: Preservation - Non-Formatted Content And Unrelated Flows Unchanged

_For any_ input where the bug condition does NOT hold (`isBugCondition` returns false — plain-text-only posts, and all non-forum rendering such as `MarkdownRenderer` in the Oracle chat), the fixed code SHALL produce the same result as the original code, preserving plain-text display, the forum service persistence/retrieval flow and stored content format, topic/author/timestamp display, and Oracle chat rendering.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4**

## Fix Implementation

### Changes Required

Assuming the root cause (CSS scoping mismatch) is correct, the fix shares one formatting stylesheet between the editor and the display view. The stored content format and the forum service are untouched.

**File**: `frontend/src/components/RichTextEditor.tsx`

**Change**: Broaden the selector scope so the formatting rules apply to a shared class in addition to the editor surface, and add that class to the editor `<div>`.

1. **Introduce a shared class**: Add a class such as `rich-content` to the editor's editable `<div>` (it already has `prose prose-sm max-w-none`).
2. **Retarget the style rules**: Change the selectors from `[contenteditable] h1` (etc.) to also match `.rich-content h1` (etc.), covering `h1/h2/h3`, `ul/ol`, `img`, and `hr`. Keep the `[contenteditable]:empty:before` placeholder rule scoped to the editor only (it is editor-specific and must not affect display).
3. **Export the shared styles**: Move the formatting rules into a single shared source so both the editor and the display view use the identical CSS. Options (choose the minimal one that fits the project): a small shared CSS file (e.g. `frontend/src/styles/richContent.css`) imported by both, or a tiny exported `RichContentStyles` component rendering the `<style>` block. This avoids duplication and prevents drift (satisfies 2.6's "consistent with editing").

**File**: `frontend/src/pages/TopicDetailPage.tsx`

**Change**: Apply the shared class to the display container and ensure the shared styles are present on the page.

4. **Add the shared class to the display container**: On the post display `<div>` that uses `dangerouslySetInnerHTML`, add `rich-content` alongside the existing `text-sm text-gray-700 prose prose-sm max-w-none` classes so the shared rules match.
5. **Ensure shared styles are loaded**: Import the shared CSS file (or render the shared `RichContentStyles`) on `TopicDetailPage` so the rules exist even when the editor is not mounted (i.e. when only viewing posts). No change to `dangerouslySetInnerHTML` usage or to the stored HTML.

**Explicitly NOT changed**:
- `frontend/src/services/forumService.ts` — content remains an opaque HTML string; persistence/retrieval unchanged (3.2).
- `frontend/src/components/MarkdownRenderer.tsx` and the Oracle chat path — untouched (3.4).
- Stored post content format — no migration, no sanitization change.

## Testing Strategy

### Validation Approach

Two phases: first surface counterexamples that demonstrate the bug on the unfixed code (confirming the scoping root cause), then verify the fix renders formatting consistently and preserves all non-buggy behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples demonstrating that formatted content renders flattened at display time on the UNFIXED code, confirming (or refuting) the CSS-scoping root cause. If refuted, re-hypothesize.

**Test Plan**: Render `TopicDetailPage` (or the isolated display container) with post `content` HTML containing each formatting type, and assert on the rendered output / computed presentation. Run against the unfixed code to observe that block/semantic formatting is not styled like the editor.

**Test Cases**:
1. **Heading display**: Post content `<h1>Titre</h1>` renders without heading-level styling in the display container (will fail expectations on unfixed code).
2. **List display**: Post content with `<ul><li>...</li></ul>` renders without list styling/indentation (will fail on unfixed code).
3. **Image display**: Post content with `<img src="...">` renders unconstrained (no max-width/rounded styling) (will fail on unfixed code).
4. **Horizontal rule display**: Post content with `<hr>` renders without the styled separator (will fail on unfixed code).
5. **Edge case — out-of-editor scope**: Confirm the `[contenteditable]`-scoped rules do not apply to the non-`contenteditable` display container (root-cause confirmation).

**Expected Counterexamples**:
- Heading/list/image/hr formatting present in the HTML but not visibly styled at display time.
- Possible causes: styles scoped to `[contenteditable]`, styles not shared with the display view, display container not carrying the formatting class.

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed display path renders the formatting and matches the editor's appearance.

**Pseudocode:**
```
FOR ALL X WHERE isBugCondition(X) DO
  rendered := displayPost_fixed(X)
  ASSERT formattingVisiblyRendered(rendered)
         AND rendered_matches_editor_appearance(X)
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed code produces the same result as the original code.

**Pseudocode:**
```
FOR ALL X WHERE NOT isBugCondition(X) DO
  ASSERT displayPost_original(X) = displayPost_fixed(X)
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many test cases automatically across the input domain (plain-text strings, punctuation, whitespace, unicode/emoji).
- It catches edge cases that manual unit tests might miss.
- It provides strong guarantees that plain-text rendering is unchanged for all non-buggy inputs.

**Test Plan**: Observe display behavior on the UNFIXED code for plain-text posts, the forum service flow, topic/author/timestamp display, and `MarkdownRenderer` in the Oracle chat; then write tests asserting these remain identical after the fix.

**Test Cases**:
1. **Plain-text preservation**: Observe that a plain-text post renders unchanged on unfixed code, then verify it still renders identically after the fix (3.1).
2. **Service flow preservation**: Verify create/edit/delete still persist and retrieve `content` through the existing endpoints with the same stored HTML format (3.2).
3. **Topic/author/timestamp preservation**: Verify topic title, author names, and timestamps display unchanged for authenticated and public users (3.3).
4. **MarkdownRenderer preservation**: Verify the Oracle chat rendering via `MarkdownRenderer` is byte-for-byte unchanged, and confirm `MarkdownRenderer.tsx` is not modified (3.4).

### Unit Tests

- Display container renders each formatting type (headings, lists, alignment, image, hr) with the expected styling after the fix.
- Editor still renders formatting while composing (no regression from retargeting selectors).
- Placeholder behavior (`[contenteditable]:empty:before`) still works in the editor and does not leak into the display view.

### Property-Based Tests

- Generate random plain-text strings (including whitespace, punctuation, unicode/emoji) and assert display output is identical before and after the fix (preservation).
- Generate random combinations of inline tags and assert consistent, visible rendering across the editor and display view.
- Generate random valid heading/list/image/hr fragments and assert the display view matches the editor's styling.

### Integration Tests

- Full flow: compose a formatted post in `RichTextEditor`, submit through `forumService`, reload the topic, and assert `TopicDetailPage` renders the formatting matching the editor.
- Edit flow: edit an existing formatted post and confirm the re-rendered content stays consistent between edit mode (editor) and view mode (display).
- Public vs. authenticated topic load: confirm formatted posts render consistently in both `getTopic` and `getTopicPublic` paths, and that Oracle chat rendering elsewhere is unaffected.

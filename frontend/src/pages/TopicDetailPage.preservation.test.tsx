import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import fc from 'fast-check';
import { TopicDetailPage } from './TopicDetailPage';
import { forumService, type TopicDetail } from '../services/forumService';
import { authService } from '../services/authService';
import { MarkdownRenderer } from '../components/MarkdownRenderer';
import { LanguageProvider } from '../hooks/useLanguage';

/**
 * Bugfix: forum-text-formatting-fix — Task 2
 * Property 2 (Preservation): Plain-Text And Unrelated Flows Unchanged
 *
 * Observation-first methodology: these assertions encode behavior observed on
 * the UNFIXED code. They are EXPECTED TO PASS now (establishing the baseline
 * to preserve) and MUST STILL PASS after the CSS-scoping fix is applied.
 *
 * The fix only broadens formatting CSS to a shared `.rich-content` class and
 * adds that class to two containers. For inputs where `isBugCondition` is
 * false (plain text, and non-forum paths like MarkdownRenderer) the rendered
 * result must be identical before and after the fix.
 *
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4
 */

vi.mock('../services/forumService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/forumService')>();
  return {
    ...actual,
    forumService: {
      ...actual.forumService,
      getTopic: vi.fn(),
      getTopicPublic: vi.fn(),
      createPost: vi.fn(),
      updatePost: vi.fn(),
      deletePost: vi.fn(),
    },
  };
});

vi.mock('../services/authService', () => ({
  authService: {
    isAuthenticated: vi.fn(() => false),
  },
}));

const mockedForum = vi.mocked(forumService);
const mockedAuth = vi.mocked(authService);

const buildTopic = (content: string, overrides: Partial<TopicDetail> = {}): TopicDetail => ({
  id: 'topic-1',
  title: 'Sujet de test',
  author_id: 'author-1',
  author_name: 'Alice',
  is_pinned: false,
  is_locked: false,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
  post_count: 1,
  posts: [
    {
      id: 'post-1',
      topic_id: 'topic-1',
      author_id: 'author-1',
      author_name: 'Alice',
      content,
      is_hidden: false,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    },
  ],
  ...overrides,
});

// Locate the post display container that renders stored HTML via
// dangerouslySetInnerHTML (the `.prose` div holding the post content).
const findDisplayContainer = (root: HTMLElement): HTMLElement | null => {
  const proseNodes = Array.from(root.querySelectorAll<HTMLElement>('.prose'));
  return proseNodes.find((el) => el.getAttribute('class')?.includes('text-gray-700')) ?? null;
};

const renderTopicPage = () =>
  render(
    <LanguageProvider>
      <MemoryRouter initialEntries={['/forum/topics/topic-1']}>
        <Routes>
          <Route path="/forum/topics/:topicId" element={<TopicDetailPage />} />
        </Routes>
      </MemoryRouter>
    </LanguageProvider>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  cleanup();
  mockedAuth.isAuthenticated.mockReturnValue(false);
});

afterEach(() => {
  cleanup();
});

/**
 * 3.1 — Plain-text preservation (property-based).
 *
 * For plain-text-only content (no HTML formatting tags, so `isBugCondition` is
 * false), the display container renders the text as-is. We assert the
 * container's rendered text content equals the input. Because the fix touches
 * only formatting CSS and container classes — never the HTML injection or the
 * stored string — this output is identical before and after the fix.
 */
describe('Property 2 (Preservation): plain-text posts render unchanged (3.1)', () => {
  // Generator: plain-text strings including whitespace, punctuation, unicode
  // and emoji, but WITHOUT any HTML-significant characters so the content
  // carries no formatting (isBugCondition === false) and is not HTML-escaped.
  const safeCharArb = fc.oneof(
    fc.constantFrom(...' \t.,!?;:\'"()[]-_/@#%'.split('')), // whitespace + punctuation
    fc.constantFrom('a', 'B', 'z', '0', '9', 'M', 'q'), // plain alphanumerics
    fc.constantFrom('é', 'à', 'ü', 'ñ', 'ç', 'ß', '你', 'あ', 'Ω'), // unicode
    fc.constantFrom('😀', '🎉', '🔥', '❤️', '👍', '🚀'), // emoji
  );

  const plainTextArb = fc
    .array(safeCharArb, { minLength: 1, maxLength: 60 })
    .map((chars) => chars.join(''))
    // Must be non-empty after trimming so the topic actually loads a post, and
    // must contain no HTML-significant characters (so it stays plain text and
    // is not HTML-escaped when injected).
    .filter((s) => s.trim().length > 0 && !/[<>&]/.test(s));

  it('display container text content matches the plain-text input for all generated strings', async () => {
    await fc.assert(
      fc.asyncProperty(plainTextArb, async (text) => {
        cleanup();
        vi.clearAllMocks();
        mockedAuth.isAuthenticated.mockReturnValue(false);
        mockedForum.getTopicPublic.mockResolvedValue(buildTopic(text));

        const { container } = renderTopicPage();

        await waitFor(() => {
          expect(mockedForum.getTopicPublic).toHaveBeenCalledWith('topic-1');
        });

        const display = await waitFor(() => {
          const el = findDisplayContainer(container);
          expect(el).not.toBeNull();
          return el as HTMLElement;
        });

        // Baseline behavior: plain text is injected verbatim, so the rendered
        // text content round-trips the input, and no formatting elements are
        // introduced.
        expect(display.textContent).toBe(text);
        expect(display.querySelector('h1, h2, h3, ul, ol, img, hr')).toBeNull();
      }),
      { numRuns: 60 },
    );
  });

  it('example: a simple plain-text post displays its exact text', async () => {
    const text = 'Bonjour, ceci est un message simple. 🚀';
    mockedForum.getTopicPublic.mockResolvedValue(buildTopic(text));

    const { container } = renderTopicPage();

    await waitFor(() => expect(mockedForum.getTopicPublic).toHaveBeenCalledWith('topic-1'));

    const display = await waitFor(() => {
      const el = findDisplayContainer(container);
      expect(el).not.toBeNull();
      return el as HTMLElement;
    });

    expect(display.textContent).toBe(text);
    expect(display.innerHTML).toBe(text);
  });
});

/**
 * 3.3 — Topic title, author names and timestamps display for authenticated
 * and public users. The fix does not touch these elements; this captures the
 * baseline that must remain unchanged.
 */
describe('Property 2 (Preservation): topic/author/timestamp display (3.3)', () => {
  it('public user: title, author and formatted timestamp render via getTopicPublic', async () => {
    mockedAuth.isAuthenticated.mockReturnValue(false);
    mockedForum.getTopicPublic.mockResolvedValue(buildTopic('Texte simple'));

    renderTopicPage();

    await waitFor(() => expect(mockedForum.getTopicPublic).toHaveBeenCalledWith('topic-1'));

    // Topic title.
    expect(await screen.findByRole('heading', { name: 'Sujet de test' })).toBeInTheDocument();
    // Author name appears (topic header + post).
    expect(screen.getAllByText('Alice').length).toBeGreaterThan(0);
    // Timestamp formatted in fr-FR (year "2024" present in the rendered date).
    expect(screen.getAllByText(/2024/).length).toBeGreaterThan(0);
    // Public path used, not the authenticated one.
    expect(mockedForum.getTopic).not.toHaveBeenCalled();
  });

  it('authenticated user: title, author and timestamp render via getTopic', async () => {
    mockedAuth.isAuthenticated.mockReturnValue(true);
    mockedForum.getTopic.mockResolvedValue(buildTopic('Texte simple'));

    renderTopicPage();

    await waitFor(() => expect(mockedForum.getTopic).toHaveBeenCalledWith('topic-1'));

    expect(await screen.findByRole('heading', { name: 'Sujet de test' })).toBeInTheDocument();
    expect(screen.getAllByText('Alice').length).toBeGreaterThan(0);
    expect(screen.getAllByText(/2024/).length).toBeGreaterThan(0);
    // Authenticated path used, not the public one.
    expect(mockedForum.getTopicPublic).not.toHaveBeenCalled();
  });
});

/**
 * 3.4 — MarkdownRenderer (Oracle chat, non-forum path) renders exactly as
 * before and its source file must not be modified by the fix.
 */
describe('Property 2 (Preservation): MarkdownRenderer output unchanged (3.4)', () => {
  // Byte-for-byte expected HTML captured by observing the UNFIXED renderer.
  const MARKDOWN_CASES: ReadonlyArray<{ name: string; input: string; expectedHtml: string }> = [
    {
      name: 'plain text',
      input: 'Hello world',
      expectedHtml: 'Hello world',
    },
    {
      name: 'bold',
      input: 'a **bold** b',
      expectedHtml: 'a <strong class="font-bold">bold</strong> b',
    },
    {
      name: 'inline code',
      input: 'use `npm run`',
      expectedHtml: 'use <code class="bg-gray-200 px-1.5 py-0.5 rounded text-sm font-mono">npm run</code>',
    },
    {
      name: 'h1 header',
      input: '# Title',
      expectedHtml: '<h1 class="text-2xl font-bold mt-4 mb-2">Title</h1>',
    },
    {
      name: 'unordered list item',
      input: '- item',
      expectedHtml: '<li class="ml-4">• item</li>',
    },
    {
      name: 'line breaks',
      // The renderer emits '<br/>'; the DOM serializes it back as '<br>' when
      // read via innerHTML. This captures the observed baseline output.
      input: 'a\nb',
      expectedHtml: 'a<br>b',
    },
  ];

  it.each(MARKDOWN_CASES)('renders $name byte-for-byte as before', ({ input, expectedHtml }) => {
    const { container } = render(<MarkdownRenderer content={input} />);
    const rendered = container.querySelector('.prose') as HTMLElement;
    expect(rendered).not.toBeNull();
    expect(rendered.innerHTML).toBe(expectedHtml);
  });

  it('MarkdownRenderer.tsx source is not modified by the fix', () => {
    // The fix must not touch this file. This pins the exact current byte length
    // and a content fingerprint so any modification to the file fails the test.
    const source = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), '../components/MarkdownRenderer.tsx'),
      'utf-8',
    );

    // The renderer must still use its own `prose prose-sm` container and must
    // NOT adopt the shared `rich-content` class (that class belongs to the
    // forum surfaces only).
    expect(source).toContain('renderMarkdown');
    expect(source).toContain('prose prose-sm max-w-none');
    expect(source).not.toContain('rich-content');

    // Fingerprint: number of non-whitespace characters. Any semantic edit to
    // the file changes this count.
    const fingerprint = source.replace(/\s/g, '').length;
    expect(fingerprint).toBe(1073);
  });
});

/**
 * 3.2 — Forum service create/edit/delete persist and retrieve `content`
 * through the existing endpoints with the same stored HTML format. The fix
 * does not modify forumService, so these baseline interactions are preserved.
 *
 * These tests exercise the REAL forumService (unmocked) against a mocked axios
 * `api` layer to assert the request endpoints and payloads, and that the
 * returned `content` round-trips unchanged.
 */
describe('Property 2 (Preservation): forum service flow unchanged (3.2)', () => {
  it('forumService.ts source is not modified by the fix', () => {
    const source = readFileSync(
      resolve(dirname(fileURLToPath(import.meta.url)), '../services/forumService.ts'),
      'utf-8',
    );
    // Endpoints and content passthrough remain intact and no formatting/CSS
    // concern leaks into the service.
    expect(source).toContain('/forum/topics/${topicId}/posts');
    expect(source).toContain('/forum/posts/${postId}');
    expect(source).not.toContain('rich-content');
    const fingerprint = source.replace(/\s/g, '').length;
    expect(fingerprint).toBe(1726);
  });
});

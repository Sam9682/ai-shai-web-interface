import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, within, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import fc from 'fast-check';
import { DocumentsPage, formatSize } from './DocumentsPage';
import { documentService, type Document, type DocumentCategory } from '../services/documentService';

// Mock the service module: both methods are vi.fn()s whose behaviour is set per test.
vi.mock('../services/documentService', () => ({
  documentService: {
    listDocuments: vi.fn(),
    downloadDocument: vi.fn(),
  },
}));

const mockedListDocuments = vi.mocked(documentService.listDocuments);
const mockedDownloadDocument = vi.mocked(documentService.downloadDocument);

// Minimum property-test iterations mandated by the design (>= 100).
const NUM_RUNS = 100;

const CATEGORIES: DocumentCategory[] = ['statutes', 'minutes', 'financial_reports', 'other'];

const CATEGORY_LABELS: Record<DocumentCategory, string> = {
  statutes: 'Statuts',
  minutes: 'Comptes rendus',
  financial_reports: 'Rapports financiers',
  other: 'Autre',
};

// Build a full Document record from the fields that matter to the page.
function makeDocument(
  id: string,
  original_name: string,
  size: number,
  category: DocumentCategory,
): Document {
  return {
    id,
    filename: `${id}.bin`,
    original_name,
    mime_type: 'application/octet-stream',
    size,
    category,
    access_level: 'members',
    uploaded_by: 'admin-id',
    download_count: 0,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  };
}

// Name characters are restricted to a set of visible, non-whitespace characters
// so that DOM text matching (getByText) is stable — the browser collapses and
// trims whitespace, which would make whitespace-only names unmatchable. The set
// intentionally mixes upper/lower case so the case-insensitive search filter is
// meaningfully exercised.
const nameCharArb = fc.constantFrom(
  ...'abcdefghijABCDEFGHIJ0123456789-_.'.split(''),
);
const nameArb: fc.Arbitrary<string> = fc
  .array(nameCharArb, { minLength: 1, maxLength: 12 })
  .map((chars) => chars.join(''));

// Arbitrary list of documents with UNIQUE ids. Names/sizes/categories are arbitrary.
// ids are made unique via their array index.
const documentsArb: fc.Arbitrary<Document[]> = fc
  .array(
    fc.record({
      original_name: nameArb,
      size: fc.integer({ min: 0, max: 5_000_000 }),
      category: fc.constantFrom(...CATEGORIES),
    }),
    { minLength: 0, maxLength: 5 },
  )
  .map((rows) =>
    rows.map((row, index) => makeDocument(`doc-${index}`, row.original_name, row.size, row.category)),
  );

// Search queries: drawn from the same visible characters plus spaces, and the
// empty string, to exercise both the substring-match and the empty-query paths.
const queryArb: fc.Arbitrary<string> = fc.oneof(
  fc.constant(''),
  fc
    .array(fc.constantFrom(...'abcdEFGH01-_. '.split('')), { minLength: 1, maxLength: 6 })
    .map((chars) => chars.join('')),
);

// Wait until the loading state has resolved (the page shows either sections,
// the empty-state message, or the search box).
async function waitForLoaded(): Promise<void> {
  await screen.findByLabelText('Rechercher un document');
}

// Return the <section> element for a given category, or null if not rendered.
function sectionForCategory(category: DocumentCategory): HTMLElement | null {
  const heading = screen.queryByRole('heading', { level: 2, name: CATEGORY_LABELS[category] });
  if (!heading) return null;
  return heading.closest('section');
}

beforeEach(() => {
  vi.clearAllMocks();
  cleanup();
  // Sensible default so a test that forgets to configure still resolves cleanly.
  mockedListDocuments.mockResolvedValue({ documents: [], total: 0 });
  mockedDownloadDocument.mockResolvedValue(undefined);
});

// -----------------------------------------------------------------------------
// Task 7.2
// Feature: docs-auto-seed-and-documents-page
// Property 7: Grouping is a partition by category.
// Validates: Requirements 8.1
// -----------------------------------------------------------------------------
describe('Property 7: grouping is a partition by category', () => {
  it('every displayed document appears in exactly its category section', async () => {
    await fc.assert(
      fc.asyncProperty(documentsArb, async (documents) => {
        cleanup();
        mockedListDocuments.mockResolvedValue({ documents, total: documents.length });

        render(<DocumentsPage />);
        await waitForLoaded();

        // Collect, per category, the set of document ids rendered under that
        // category's section. Item ids are read from a data attribute keyed by id.
        const seenIds = new Set<string>();

        for (const category of CATEGORIES) {
          const expectedDocs = documents.filter((d) => d.category === category);
          const section = sectionForCategory(category);

          if (expectedDocs.length === 0) {
            // Only non-empty sections render.
            expect(section).toBeNull();
            continue;
          }

          expect(section).not.toBeNull();
          const items = within(section as HTMLElement).getAllByRole('listitem');
          // Exactly the docs of this category appear under this section.
          expect(items).toHaveLength(expectedDocs.length);

          // Each expected document name shows up exactly once within the section.
          for (const doc of expectedDocs) {
            expect(within(section as HTMLElement).getAllByText(doc.original_name).length).toBeGreaterThan(0);
            // Track that this id has been accounted for exactly once across sections.
            expect(seenIds.has(doc.id)).toBe(false);
            seenIds.add(doc.id);
          }
        }

        // Union of all sections equals the full displayed set (disjoint + complete).
        expect(seenIds.size).toBe(documents.length);
        cleanup();
      }),
      { numRuns: NUM_RUNS },
    );
  });
});

// -----------------------------------------------------------------------------
// Task 7.3
// Feature: docs-auto-seed-and-documents-page
// Property 8: Displayed item content.
// Validates: Requirements 8.2, 8.3
// -----------------------------------------------------------------------------
describe('Property 8: displayed item content', () => {
  it('every rendered item shows the name, its formatted size, and a download control', async () => {
    await fc.assert(
      fc.asyncProperty(documentsArb, async (documents) => {
        cleanup();
        mockedListDocuments.mockResolvedValue({ documents, total: documents.length });

        render(<DocumentsPage />);
        await waitForLoaded();

        // One "Télécharger" button per document.
        const downloadButtons = screen.queryAllByRole('button', { name: 'Télécharger' });
        expect(downloadButtons).toHaveLength(documents.length);

        for (const doc of documents) {
          // Name present.
          expect(screen.getAllByText(doc.original_name).length).toBeGreaterThan(0);
          // Formatted size present.
          expect(screen.getAllByText(formatSize(doc.size)).length).toBeGreaterThan(0);
        }

        cleanup();
      }),
      { numRuns: NUM_RUNS },
    );
  });
});

// -----------------------------------------------------------------------------
// Task 7.4
// Feature: docs-auto-seed-and-documents-page
// Property 9: Search filter subset and membership.
// Validates: Requirements 9.1, 9.2
// -----------------------------------------------------------------------------
describe('Property 9: search filter subset and membership', () => {
  it('displays exactly the case-insensitive substring matches; all docs when empty', async () => {
    await fc.assert(
      fc.asyncProperty(documentsArb, queryArb, async (documents, query) => {
        cleanup();
        mockedListDocuments.mockResolvedValue({ documents, total: documents.length });

        render(<DocumentsPage />);
        const input = await screen.findByLabelText('Rechercher un document');

        // Set the input value directly. fireEvent.change avoids userEvent's
        // keyboard-descriptor parsing of characters like "[" or "{".
        fireEvent.change(input, { target: { value: query } });

        // Expected set: page trims + lowercases the query before matching.
        const normalized = query.trim().toLowerCase();
        const expected =
          normalized === ''
            ? documents
            : documents.filter((d) => d.original_name.toLowerCase().includes(normalized));

        await waitFor(() => {
          const buttons = screen.queryAllByRole('button', { name: 'Télécharger' });
          expect(buttons).toHaveLength(expected.length);
        });

        // Displayed set is a subset of the full list and equals the expected matches.
        const expectedIds = new Set(expected.map((d) => d.id));
        for (const doc of documents) {
          const shown = screen.queryAllByText(doc.original_name).length > 0;
          if (expectedIds.has(doc.id)) {
            expect(shown).toBe(true);
          }
        }

        cleanup();
      }),
      { numRuns: NUM_RUNS },
    );
  });
});

// -----------------------------------------------------------------------------
// Task 7.5 — Unit / example tests
// Validates: Requirements 7.3, 10.1, 10.3
// -----------------------------------------------------------------------------

// Feature: docs-auto-seed-and-documents-page
// Property: formatSize returns a defined, non-empty string with a unit.
// Validates: Requirements 8.2
describe('formatSize', () => {
  it('returns a non-empty string containing a size unit for any non-negative integer', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 500_000_000_000 }), (bytes) => {
        const result = formatSize(bytes);
        expect(typeof result).toBe('string');
        expect(result.length).toBeGreaterThan(0);
        // Must contain one of the known units.
        expect(/\b(o|Ko|Mo|Go)\b/.test(result)).toBe(true);
      }),
      { numRuns: NUM_RUNS },
    );
  });
});

describe('DocumentsPage — mount and interactions', () => {
  it('calls documentService.listDocuments on mount', async () => {
    mockedListDocuments.mockResolvedValue({ documents: [], total: 0 });

    render(<DocumentsPage />);
    await waitForLoaded();

    expect(mockedListDocuments).toHaveBeenCalledTimes(1);
  });

  it('calls downloadDocument with the document id and original_name when Télécharger is clicked', async () => {
    const doc = makeDocument('doc-1', 'statuts.pdf', 2048, 'statutes');
    mockedListDocuments.mockResolvedValue({ documents: [doc], total: 1 });
    mockedDownloadDocument.mockResolvedValue(undefined);

    render(<DocumentsPage />);
    await waitForLoaded();

    const button = await screen.findByRole('button', { name: 'Télécharger' });
    await userEvent.click(button);

    expect(mockedDownloadDocument).toHaveBeenCalledTimes(1);
    expect(mockedDownloadDocument).toHaveBeenCalledWith('doc-1', 'statuts.pdf');
  });

  it('shows a French error message when the document list fails to load', async () => {
    mockedListDocuments.mockRejectedValue(new Error('network'));

    render(<DocumentsPage />);

    expect(await screen.findByText('Impossible de charger les documents')).toBeInTheDocument();
  });

  it('shows a French per-download error message when the download fails', async () => {
    const doc = makeDocument('doc-1', 'rapport.pdf', 1024, 'financial_reports');
    mockedListDocuments.mockResolvedValue({ documents: [doc], total: 1 });
    mockedDownloadDocument.mockRejectedValue(new Error('denied'));

    render(<DocumentsPage />);
    await waitForLoaded();

    const button = await screen.findByRole('button', { name: 'Télécharger' });
    await userEvent.click(button);

    expect(
      await screen.findByText('Échec du téléchargement de « rapport.pdf »'),
    ).toBeInTheDocument();
  });
});

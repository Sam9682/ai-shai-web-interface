import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, within, fireEvent, act } from '@testing-library/react';
import fc from 'fast-check';
import { QuestionAnswerForm } from './QuestionAnswerForm';
import { PREREQ_MARKERS } from './types';
import type { QuestionFormConfig } from './types';
import { authService } from '../../services/authService';
import { prerequisitesService } from '../../services/prerequisitesService';

// Minimum property-test iterations mandated by the design (>= 100).
const NUM_RUNS = 100;

// QuestionAnswerForm reads authentication/role through authService and persists
// answers through prerequisitesService. Mock both modules so the component's
// behavior is driven entirely by the test rather than the network or
// localStorage. Individual tests set the return values they need.
vi.mock('../../services/authService', () => ({
  authService: {
    isAuthenticated: vi.fn(),
    isAdmin: vi.fn(),
  },
}));

vi.mock('../../services/prerequisitesService', () => ({
  prerequisitesService: {
    loadClientAnswers: vi.fn(),
    saveClientAnswer: vi.fn(),
  },
}));

const mockedAuth = vi.mocked(authService);
const mockedPrereq = vi.mocked(prerequisitesService);

// Configure authService for a given member/non-member flag.
// - member: authenticated && !admin  -> canAnswer === true
// - non-member: modeled here as an authenticated admin -> canAnswer === false
function setAuth(isMember: boolean) {
  mockedAuth.isAuthenticated.mockReturnValue(true);
  mockedAuth.isAdmin.mockReturnValue(!isMember);
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: loads resolve to empty answers so mount never rejects.
  mockedPrereq.loadClientAnswers.mockResolvedValue({ slug: '', answers: {} });
  mockedPrereq.saveClientAnswer.mockResolvedValue(undefined);
});

afterEach(() => {
  cleanup();
});

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

// A single generated row with index-derived, page-unique fields. questionPrimary
// must be unique because it keys the Client answer control's accessible label;
// exampleValue/commentsHint are made unique and non-empty so annotation lookups
// never collide (the component renders '—' only when a field is absent).
function makeRow(sIdx: number, rIdx: number, mandatory: boolean) {
  return {
    id: `s${sIdx}-r${rIdx}`,
    questionPrimary: `Question ${sIdx}-${rIdx}`,
    questionSecondary: `Détail ${sIdx}-${rIdx}`,
    mandatory,
    exampleValue: `Exemple-${sIdx}-${rIdx}`,
    commentsHint: `Indice-${sIdx}-${rIdx}`,
  };
}

// Arbitrary, well-formed QuestionFormConfig: 1-3 sections, each with 1-4 rows.
// The per-row `mandatory` flag is drawn from fast-check so the marker property
// exercises both branches. All ids/labels are unique across the whole config.
const questionConfigArb: fc.Arbitrary<QuestionFormConfig> = fc
  .array(fc.array(fc.boolean(), { minLength: 1, maxLength: 4 }), {
    minLength: 1,
    maxLength: 3,
  })
  .map((sections) => ({
    sections: sections.map((mandatories, sIdx) => ({
      id: `section-${sIdx}`,
      title: `Section ${sIdx}`,
      rows: mandatories.map((mandatory, rIdx) => makeRow(sIdx, rIdx, mandatory)),
    })),
  }));

function totalRows(config: QuestionFormConfig): number {
  return config.sections.reduce((sum, s) => sum + s.rows.length, 0);
}

// ---------------------------------------------------------------------------
// Property 6: Question pages show read-only questions and an editable member
// answer. Validates: Requirements 5.1, 5.2, 5.3
// ---------------------------------------------------------------------------

// Feature: opcp-prerequisites-tabs, Property 6: Question pages show read-only
// questions and an editable member answer.
describe('Property 6: read-only questions + editable member answer', () => {
  it('renders both question columns as non-editable text and exactly one Client answer control per row, editable iff the user is a member', () => {
    fc.assert(
      fc.property(questionConfigArb, fc.boolean(), (config, isMember) => {
        cleanup();
        setAuth(isMember);

        render(<QuestionAnswerForm slug="network-checklist" title="Test" config={config} />);

        const canAnswer = isMember; // authenticated && !admin

        for (const section of config.sections) {
          for (const row of section.rows) {
            // The two question columns render as static text, not inputs. Their
            // exact strings appear in the document as plain text nodes.
            const primaryNode = screen.getByText(row.questionPrimary);
            const secondaryNode = screen.getByText(row.questionSecondary!);
            expect(primaryNode.tagName).not.toBe('INPUT');
            expect(primaryNode.tagName).not.toBe('TEXTAREA');
            expect(secondaryNode.tagName).not.toBe('INPUT');
            expect(secondaryNode.tagName).not.toBe('TEXTAREA');

            // Exactly one editable-or-readonly Client answer control per row,
            // addressed by its unique accessible label.
            const answer = screen.getByLabelText(
              `Réponse client — ${row.questionPrimary}`,
            ) as HTMLInputElement;
            expect(answer.tagName).toBe('INPUT');

            // Editable iff the user is a member; otherwise read-only/disabled.
            if (canAnswer) {
              expect(answer).not.toHaveAttribute('readonly');
              expect(answer).not.toBeDisabled();
            } else {
              expect(answer).toHaveAttribute('readonly');
              expect(answer).toBeDisabled();
            }
          }
        }

        // Exactly one Client answer control exists per row overall.
        const allAnswers = screen.getAllByLabelText(/^Réponse client — /);
        expect(allAnswers).toHaveLength(totalRows(config));

        cleanup();
      }),
      { numRuns: NUM_RUNS },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 7: Every question row displays its required annotations.
// Validates: Requirements 5.4, 5.5, 5.6
// ---------------------------------------------------------------------------

// Feature: opcp-prerequisites-tabs, Property 7: Every question row displays its
// required annotations.
describe('Property 7: required row annotations', () => {
  it('shows the correct mandatory/optional marker, example value, and comments hint for each row', () => {
    fc.assert(
      fc.property(questionConfigArb, fc.boolean(), (config, isMember) => {
        cleanup();
        setAuth(isMember);

        render(<QuestionAnswerForm slug="vcf" title="Test" config={config} />);

        const expectedMandatory = PREREQ_MARKERS.mandatory;
        const expectedOptional = PREREQ_MARKERS.optional;

        for (const section of config.sections) {
          for (const row of section.rows) {
            const expected = row.mandatory ? expectedMandatory : expectedOptional;

            // Markers repeat across rows (many rows share the same flag), so
            // scope the assertion to this row's container. The answer input's
            // unique label anchors the row; the marker lives in the same row.
            const answer = screen.getByLabelText(
              `Réponse client — ${row.questionPrimary}`,
            );
            const rowEl = answer.closest('div.border-b') as HTMLElement;
            expect(rowEl).not.toBeNull();

            // The marker icon is rendered on a node whose aria-label is the
            // marker label; within the row it is unique.
            const markerIcon = within(rowEl).getByLabelText(expected.label);
            expect(markerIcon).toHaveTextContent(expected.icon);
            // The opposite marker is absent from this row.
            const opposite = row.mandatory ? expectedOptional : expectedMandatory;
            expect(within(rowEl).queryByLabelText(opposite.label)).toBeNull();

            // The example value and comments hint render as their exact text.
            expect(within(rowEl).getByText(row.exampleValue!)).toBeInTheDocument();
            expect(within(rowEl).getByText(row.commentsHint!)).toBeInTheDocument();
          }
        }

        cleanup();
      }),
      { numRuns: NUM_RUNS },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 9: Saving a client answer forwards it to the service.
// Validates: Requirements 5.7
// ---------------------------------------------------------------------------

// A minimal fixed config used by the DOM-interaction properties (save + error).
// A single row keeps the interaction unambiguous while fast-check varies the
// typed value.
const fixedConfig: QuestionFormConfig = {
  sections: [
    {
      id: 'section-0',
      title: 'Section 0',
      rows: [makeRow(0, 0, true)],
    },
  ],
};
const FIXED_ROW_ID = 's0-r0';
const FIXED_LABEL = 'Réponse client — Question 0-0';

// Feature: opcp-prerequisites-tabs, Property 9: Saving a client answer forwards
// it to the service.
describe('Property 9: saving a client answer forwards it to the service', () => {
  it('calls saveClientAnswer(slug, rowId, value) on blur for a member', async () => {
    // fast-check varies the typed value across the input space. A member
    // changes the answer, then blurs to trigger the onBlur save.
    await fc.assert(
      fc.asyncProperty(fc.string(), async (value) => {
        cleanup();
        vi.clearAllMocks();
        mockedPrereq.loadClientAnswers.mockResolvedValue({ slug: '', answers: {} });
        mockedPrereq.saveClientAnswer.mockResolvedValue(undefined);
        setAuth(true);

        const slug = 'core-control-plane';
        render(<QuestionAnswerForm slug={slug} title="Test" config={fixedConfig} />);

        // Let the mount-time loadClientAnswers promise resolve before typing.
        await act(async () => {
          await Promise.resolve();
        });

        const input = screen.getByLabelText(FIXED_LABEL) as HTMLInputElement;
        await act(async () => {
          fireEvent.change(input, { target: { value } });
          fireEvent.blur(input, { target: { value } });
          await Promise.resolve();
        });

        expect(mockedPrereq.saveClientAnswer).toHaveBeenCalledWith(
          slug,
          FIXED_ROW_ID,
          value,
        );

        cleanup();
      }),
      { numRuns: NUM_RUNS },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 11: A failed save shows an error indication.
// Validates: Requirements 6.5
// ---------------------------------------------------------------------------

// Feature: opcp-prerequisites-tabs, Property 11: A failed save shows an error
// indication.
describe('Property 11: a failed save shows an error indication', () => {
  it('renders a per-row error alert and preserves the typed value when saveClientAnswer rejects', async () => {
    await fc.assert(
      fc.asyncProperty(fc.string({ minLength: 1 }), async (value) => {
        cleanup();
        vi.clearAllMocks();
        mockedPrereq.loadClientAnswers.mockResolvedValue({ slug: '', answers: {} });
        // The save rejects, so the component should surface a per-row error.
        mockedPrereq.saveClientAnswer.mockRejectedValue(new Error('save failed'));
        setAuth(true);

        render(
          <QuestionAnswerForm slug="cloudstore" title="Test" config={fixedConfig} />,
        );

        // Let the mount-time loadClientAnswers promise resolve first; otherwise
        // its late setAnswers({}) would clobber the value typed below.
        await act(async () => {
          await Promise.resolve();
        });

        const input = screen.getByLabelText(FIXED_LABEL) as HTMLInputElement;
        // The controlled input tracks React state: change sets the typed value,
        // blur triggers the (rejecting) save. Wrap both in act and flush the
        // rejected promise so the per-row error state commits before asserting.
        await act(async () => {
          fireEvent.change(input, { target: { value } });
          fireEvent.blur(input);
          await Promise.resolve();
          await Promise.resolve();
        });

        // A visible, per-row error indication renders (role="alert").
        const alert = await screen.findByRole('alert');
        expect(alert).toBeInTheDocument();

        // The typed value persists in the input despite the failed save.
        expect((screen.getByLabelText(FIXED_LABEL) as HTMLInputElement).value).toBe(
          value,
        );

        cleanup();
      }),
      { numRuns: NUM_RUNS },
    );
  });
});

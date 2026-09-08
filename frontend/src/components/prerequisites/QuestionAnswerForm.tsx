import { useEffect, useState } from 'react';
import { PREREQ_MARKERS } from './types';
import type { QuestionFormConfig } from './types';
import { authService } from '../../services/authService';
import { prerequisitesService } from '../../services/prerequisitesService';

interface QuestionAnswerFormProps {
  slug: string;
  title: string;
  config: QuestionFormConfig;
}

const FIELD_CLASS =
  'w-full px-3 py-2 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-[#4949FF] focus:border-transparent';

const READONLY_FIELD_CLASS =
  'w-full px-3 py-2 border border-gray-200 rounded text-sm bg-gray-100 text-gray-600 cursor-not-allowed';

/**
 * Visible key mapping the mandatory/optional markers to their icon + label so
 * the per-row markers stay consistent with the shared legend.
 */
const MarkerLegend = () => (
  <div className="mb-6 rounded border border-gray-200 bg-gray-50 p-3">
    <span className="mr-3 text-sm font-medium text-gray-700">Légende :</span>
    <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1">
      {(Object.keys(PREREQ_MARKERS) as (keyof typeof PREREQ_MARKERS)[]).map((key) => (
        <span key={key} className="text-sm text-gray-700">
          <span aria-hidden="true" className="mr-1">
            {PREREQ_MARKERS[key].icon}
          </span>
          {PREREQ_MARKERS[key].label}
        </span>
      ))}
    </div>
  </div>
);

/**
 * Data-driven question/answer form for the prerequisites pages that follow the
 * question archetype (Network Checklist, Core Control Plane, CloudStore, VCF).
 *
 * Each row renders two read-only question columns, a Mandatory/Optional marker,
 * the example value, a Comments/Details hint, and one editable Client answer.
 * The Client answer is editable only for authenticated non-admin members;
 * everyone else sees it read-only. Answers persist through
 * `prerequisitesService` (no localStorage).
 */
export const QuestionAnswerForm = ({ slug, title, config }: QuestionAnswerFormProps) => {
  const canAnswer = authService.isAuthenticated() && !authService.isAdmin();
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [errorRowIds, setErrorRowIds] = useState<Set<string>>(new Set());
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    prerequisitesService
      .loadClientAnswers(slug)
      .then((r) => {
        if (!cancelled) setAnswers(r.answers ?? {});
      })
      .catch(() => {
        if (!cancelled) setLoadError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const handleChange = (rowId: string, value: string) => {
    // Preserve the typed value locally regardless of persistence outcome.
    setAnswers((a) => ({ ...a, [rowId]: value }));
  };

  const saveAnswer = async (rowId: string, value: string) => {
    try {
      await prerequisitesService.saveClientAnswer(slug, rowId, value);
      setErrorRowIds((s) => {
        if (!s.has(rowId)) return s;
        const next = new Set(s);
        next.delete(rowId);
        return next;
      });
    } catch {
      // Record a per-row error indication; the typed value is kept in state.
      setErrorRowIds((s) => new Set(s).add(rowId));
    }
  };

  return (
    <div className="card p-6">
      <h1 className="text-2xl font-bold text-[#000E9C] mb-5">{title}</h1>

      <MarkerLegend />

      {loadError && (
        <div
          role="alert"
          className="mb-6 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700"
        >
          Impossible de charger les réponses enregistrées.
        </div>
      )}

      {config.sections.map((section) => (
        <section key={section.id} className="mb-8">
          <h2 className="text-lg font-semibold text-[#000E9C] mb-4 border-b border-gray-200 pb-2">
            {section.title}
          </h2>

          <div className="space-y-6">
            {section.rows.map((row) => {
              const marker = row.mandatory
                ? PREREQ_MARKERS.mandatory
                : PREREQ_MARKERS.optional;
              const answerId = `${row.id}-answer`;
              const hasError = errorRowIds.has(row.id);

              return (
                <div key={row.id} className="border-b border-gray-100 pb-4 last:border-b-0">
                  <div className="mb-2 flex items-center gap-2">
                    <span
                      aria-label={marker.label}
                      title={marker.label}
                      className="text-sm"
                    >
                      {marker.icon}
                    </span>
                    <span className="text-xs font-medium text-gray-500">{marker.label}</span>
                  </div>

                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div>
                      <p className="block text-xs font-medium text-gray-500 mb-1">Question</p>
                      <p className="text-sm font-medium text-gray-800">{row.questionPrimary}</p>
                    </div>

                    <div>
                      <p className="block text-xs font-medium text-gray-500 mb-1">Détail</p>
                      <p className="text-sm text-gray-700">{row.questionSecondary ?? '—'}</p>
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
                    <div>
                      <p className="block text-xs font-medium text-gray-500 mb-1">Exemple</p>
                      <p className="text-sm text-gray-700">{row.exampleValue ?? '—'}</p>
                    </div>

                    <div>
                      <p className="block text-xs font-medium text-gray-500 mb-1">
                        Commentaires / Détails
                      </p>
                      <p className="text-sm text-gray-700">{row.commentsHint ?? '—'}</p>
                    </div>

                    <div>
                      <label
                        htmlFor={answerId}
                        className="block text-xs font-medium text-gray-500 mb-1"
                      >
                        Réponse client
                      </label>
                      <input
                        type="text"
                        id={answerId}
                        aria-label={`Réponse client — ${row.questionPrimary}`}
                        value={answers[row.id] ?? ''}
                        readOnly={!canAnswer}
                        disabled={!canAnswer}
                        onChange={(e) => handleChange(row.id, e.target.value)}
                        onBlur={(e) => {
                          if (canAnswer) void saveAnswer(row.id, e.target.value);
                        }}
                        className={canAnswer ? FIELD_CLASS : READONLY_FIELD_CLASS}
                      />
                      {hasError && (
                        <p role="alert" className="mt-1 text-xs text-red-600">
                          Échec de l'enregistrement. Réessayez.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
};

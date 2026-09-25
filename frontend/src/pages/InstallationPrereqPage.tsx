import { useParams } from 'react-router-dom';
import { StaticContentPage } from '../components/prerequisites/StaticContentPage';
import { QuestionAnswerForm } from '../components/prerequisites/QuestionAnswerForm';
import {
  cloudStoreQuestionConfig,
  coreControlPlaneConfig,
  networkChecklistConfig,
  vcfConfig,
} from '../components/prerequisites/configs';
import type { QuestionFormConfig } from '../components/prerequisites/types';

/**
 * Per-slug prerequisites descriptor. Static slugs render the
 * `StaticContentPage`; question slugs render the `QuestionAnswerForm` with the
 * associated config. Titles mirror the labels the retired per-slug wrapper
 * pages used so the rendered heading is unchanged.
 */
type PrereqSlugConfig =
  | { archetype: 'static'; title: string }
  | { archetype: 'qa'; title: string; config: QuestionFormConfig };

const PREREQ_SLUG_CONFIG: Record<string, PrereqSlugConfig> = {
  basics: { archetype: 'static', title: 'Basics' },
  'network-flux': { archetype: 'static', title: 'Network Flux' },
  'network-checklist': {
    archetype: 'qa',
    title: 'Network Checklist',
    config: networkChecklistConfig,
  },
  'core-control-plane': {
    archetype: 'qa',
    title: 'Core Control Plane',
    config: coreControlPlaneConfig,
  },
  cloudstore: {
    archetype: 'qa',
    title: 'CloudStore',
    config: cloudStoreQuestionConfig,
  },
  vcf: { archetype: 'qa', title: 'VCF', config: vcfConfig },
};

/**
 * Installation-scoped prerequisites page (Req 5.3). Reads `installationId` and
 * `slug` from the route (`/prerequisites/installations/:installationId/:slug`),
 * looks up the archetype/title/config for the slug, and renders the matching
 * page component with the `installationId` threaded through. An unknown slug
 * renders a not-found message.
 */
export const InstallationPrereqPage = () => {
  const { installationId, slug } = useParams<{
    installationId: string;
    slug: string;
  }>();

  const config = slug ? PREREQ_SLUG_CONFIG[slug] : undefined;

  if (!installationId || !slug || !config) {
    return (
      <div className="card p-6">
        <div
          role="alert"
          className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800"
        >
          Page de prérequis introuvable.
        </div>
      </div>
    );
  }

  if (config.archetype === 'static') {
    return (
      <StaticContentPage
        installationId={installationId}
        slug={slug}
        title={config.title}
      />
    );
  }

  return (
    <QuestionAnswerForm
      installationId={installationId}
      slug={slug}
      title={config.title}
      config={config.config}
    />
  );
};

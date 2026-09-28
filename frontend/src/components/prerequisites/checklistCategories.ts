import type { ChecklistTab } from './ChecklistTabs';
import {
  cloudStoreQuestionConfig,
  coreControlPlaneConfig,
  networkChecklistConfig,
  vcfConfig,
} from './configs';

/**
 * Ordered checklist set for the prerequisites question archetype. This is the
 * single source of truth shared by:
 *  - the aggregate tabbed view + per-slug lookup (InstallationPrereqPage), and
 *  - the export / import / architecture-document features
 *    (installationExport service).
 *
 * Keeping one definition means the tabs rendered in the UI and the tabs written
 * to / read from an export file cannot drift apart. Each entry pairs a
 * canonical slug (the persistence key) with its display title and, for
 * question tabs, its question config. The `servers-nodes` tab is a special
 * `kind: 'servers'` entry that renders reference inventory instead of a form.
 */
export const CHECKLIST_CATEGORIES: ReadonlyArray<ChecklistTab> = [
  { slug: 'network-checklist', title: 'Network Checklist', config: networkChecklistConfig },
  { slug: 'core-control-plane', title: 'Core Control Plane', config: coreControlPlaneConfig },
  { slug: 'cloudstore', title: 'CloudStore', config: cloudStoreQuestionConfig },
  { slug: 'vcf', title: 'VCF', config: vcfConfig },
  { kind: 'servers', slug: 'servers-nodes', title: 'Servers nodes' },
];

/** Slug of the special servers/nodes tab. */
export const SERVERS_NODES_SLUG = 'servers-nodes';

/** The four question/answer tabs (everything except the servers inventory). */
export const QA_CATEGORIES = CHECKLIST_CATEGORIES.filter(
  (category): category is Extract<ChecklistTab, { config: unknown }> =>
    category.kind !== 'servers',
);

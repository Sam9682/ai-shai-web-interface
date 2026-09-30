import {
  prerequisitesService,
  type CredentialConfig,
  type Installation,
} from './prerequisitesService';
import {
  CHECKLIST_CATEGORIES,
  QA_CATEGORIES,
  SERVERS_NODES_SLUG,
} from '../components/prerequisites/checklistCategories';
import { SERVER_NODES, type ServerNode } from '../components/prerequisites/serversData';
import type { QuestionFormConfig, QuestionRow } from '../components/prerequisites/types';
import type { Language } from '../i18n/translations';

/**
 * Installation export / import + architecture-document generation.
 *
 * The five prerequisites tabs are:
 *   - Network Checklist, Core Control Plane, CloudStore, VCF — question/answer
 *     tabs whose editable values are the per-row "Réponse client" strings,
 *     persisted server-side keyed by (installationId, slug, rowId).
 *   - Servers nodes — reference inventory plus a per-installation OpenStack
 *     credential config (the secret is never returned by the backend).
 *
 * Export gathers every tab's values into one JSON document. Import reads a
 * document in that same shape and writes each answer back. The architecture
 * document renders the tabs, their parameters + values, and the server-node
 * list into a self-contained, downloadable HTML file.
 */

/** Current export schema version. Bumped if the JSON shape changes. */
export const EXPORT_FORMAT_VERSION = 1;

/** JSON shape produced by {@link exportInstallation} and accepted by import. */
export interface InstallationExport {
  format: 'opcp-installation-export';
  version: number;
  exported_at: string;
  installation: {
    id: string;
    project_name: string;
  };
  /** Per-tab client answers: slug -> { rowId -> answer }. */
  tabs: Record<string, Record<string, string>>;
  /**
   * Servers-nodes tab data. Credentials contain no secret (never exported);
   * `nodes` is the reference inventory captured at export time.
   */
  servers: {
    credentials: {
      auth_url: string;
      credential_id: string;
      nova_endpoint: string;
      ca_certificate: string;
      secret_stored: boolean;
    } | null;
    nodes: ReadonlyArray<ServerNode>;
  };
}

/** Result of an import operation, so the caller can report a summary. */
export interface ImportResult {
  /** Number of individual answer values written. */
  written: number;
  /** Number of answer writes that failed. */
  failed: number;
  /** Tab slugs present in the file that are not known tabs (skipped). */
  unknownSlugs: string[];
}

// ---------------------------------------------------------------------------
// Download helper
// ---------------------------------------------------------------------------

/**
 * Trigger a browser download of `content` as `filename`. Uses an object URL +
 * synthetic anchor click — the portable way to offer a client-generated file
 * without a server round-trip.
 */
const downloadFile = (filename: string, content: string, mimeType: string): void => {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
};

/** Slugify a project name into a safe filename fragment. */
const safeSlug = (name: string): string =>
  name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'installation';

/** Minimal HTML-escape for text interpolated into the architecture document. */
const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

/**
 * Build the export document for an installation by fetching every tab's saved
 * answers plus the servers-nodes credential config. Answer loads are done in
 * parallel; a failed tab load degrades to an empty answer map so the export
 * still succeeds for the remaining tabs.
 */
export const buildInstallationExport = async (
  installation: Installation,
): Promise<InstallationExport> => {
  const tabs: Record<string, Record<string, string>> = {};

  await Promise.all(
    QA_CATEGORIES.map(async (category) => {
      try {
        const response = await prerequisitesService.loadClientAnswers(
          installation.id,
          category.slug,
        );
        tabs[category.slug] = response.answers ?? {};
      } catch {
        tabs[category.slug] = {};
      }
    }),
  );

  let credentials: InstallationExport['servers']['credentials'] = null;
  try {
    const cfg: CredentialConfig = await prerequisitesService.loadCredentialConfig(
      installation.id,
    );
    credentials = {
      auth_url: cfg.auth_url ?? '',
      credential_id: cfg.credential_id ?? '',
      nova_endpoint: cfg.nova_endpoint ?? '',
      ca_certificate: cfg.ca_certificate ?? '',
      secret_stored: Boolean(cfg.secret_stored),
    };
  } catch {
    // No stored credential config (or load failed) — leave null.
    credentials = null;
  }

  return {
    format: 'opcp-installation-export',
    version: EXPORT_FORMAT_VERSION,
    exported_at: new Date().toISOString(),
    installation: {
      id: installation.id,
      project_name: installation.project_name,
    },
    tabs,
    servers: {
      credentials,
      nodes: SERVER_NODES,
    },
  };
};

/**
 * Export all values across every tab as a downloaded JSON file. The file name
 * embeds the project name and export date.
 */
export const exportInstallation = async (installation: Installation): Promise<void> => {
  const data = await buildInstallationExport(installation);
  const date = data.exported_at.slice(0, 10);
  const filename = `${safeSlug(installation.project_name)}-export-${date}.json`;
  downloadFile(filename, `${JSON.stringify(data, null, 2)}\n`, 'application/json');
};

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

/**
 * Parse and validate a raw import-file string into an {@link InstallationExport}.
 * Throws an Error with a stable code-like message when the file is not valid
 * JSON or does not match the expected export shape.
 */
export const parseImportFile = (raw: string): InstallationExport => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('INVALID_JSON');
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('INVALID_SHAPE');
  }

  const record = parsed as Partial<InstallationExport>;
  if (record.format !== 'opcp-installation-export') {
    throw new Error('INVALID_FORMAT');
  }
  if (!record.tabs || typeof record.tabs !== 'object') {
    throw new Error('INVALID_SHAPE');
  }

  return parsed as InstallationExport;
};

/**
 * Apply the answers from an imported document to an installation. Writes every
 * `(slug, rowId) -> answer` pair via the prerequisites service, restricting to
 * the known QA tabs and to row ids that exist in each tab's config so a stale
 * or hand-edited file cannot create orphan answers. Unknown slugs are reported
 * back rather than silently ignored.
 *
 * Note: the servers-nodes tab is reference/credential data and is intentionally
 * not written on import (the secret is never present in the file, and the node
 * inventory is read-only).
 */
export const importInstallation = async (
  installationId: string,
  data: InstallationExport,
): Promise<ImportResult> => {
  // Build slug -> Set(validRowIds) from the shared configs so we only write
  // answers that map to a real row.
  const validRowIdsBySlug = new Map<string, Set<string>>();
  for (const category of QA_CATEGORIES) {
    const config = category.config as QuestionFormConfig;
    const ids = new Set<string>();
    for (const section of config.sections) {
      for (const row of section.rows) ids.add(row.id);
    }
    validRowIdsBySlug.set(category.slug, ids);
  }

  let written = 0;
  let failed = 0;
  const unknownSlugs: string[] = [];

  for (const [slug, answers] of Object.entries(data.tabs ?? {})) {
    if (slug === SERVERS_NODES_SLUG) continue; // reference tab, nothing to write
    const validIds = validRowIdsBySlug.get(slug);
    if (!validIds) {
      unknownSlugs.push(slug);
      continue;
    }
    if (!answers || typeof answers !== 'object') continue;

    // Write sequentially per tab to keep server write pressure modest and make
    // partial-failure counting deterministic.
    for (const [rowId, answer] of Object.entries(answers)) {
      if (!validIds.has(rowId)) continue;
      const value = answer == null ? '' : String(answer);
      try {
        await prerequisitesService.saveClientAnswer(installationId, slug, rowId, value);
        written += 1;
      } catch {
        failed += 1;
      }
    }
  }

  return { written, failed, unknownSlugs };
};

// ---------------------------------------------------------------------------
// Clear all values
// ---------------------------------------------------------------------------

/** Result of a clear-all-values operation, so the caller can report a summary. */
export interface ClearResult {
  /** Number of individual answer values cleared. */
  cleared: number;
  /** Number of answer clears that failed. */
  failed: number;
}

/**
 * Clear every parameter value across all question/answer tabs (Network
 * Checklist, Core Control Plane, CloudStore, VCF) for an installation by
 * writing an empty answer to every known row. The servers-nodes tab is
 * reference/credential data and is intentionally left untouched, mirroring
 * {@link importInstallation}.
 *
 * Rows are cleared sequentially per tab to keep server write pressure modest
 * and make partial-failure counting deterministic.
 */
export const clearInstallationValues = async (
  installationId: string,
): Promise<ClearResult> => {
  let cleared = 0;
  let failed = 0;

  for (const category of QA_CATEGORIES) {
    const config = category.config as QuestionFormConfig;
    for (const section of config.sections) {
      for (const row of section.rows) {
        try {
          await prerequisitesService.saveClientAnswer(
            installationId,
            category.slug,
            row.id,
            '',
          );
          cleared += 1;
        } catch {
          failed += 1;
        }
      }
    }
  }

  return { cleared, failed };
};

// ---------------------------------------------------------------------------
// Architecture document
// ---------------------------------------------------------------------------

/**
 * Per-language vocabulary for the architecture document's static strings.
 *
 * These are export-document labels, not app UI strings, so they live here in
 * the service (keyed only by the shared {@link Language} type) rather than in
 * the shared i18n dictionaries. That keeps the service pure and unit-testable
 * and avoids coupling it to React/i18n. Node-table column headers (Node UUID,
 * Serial Number, …) are technical identifiers and are intentionally NOT part
 * of this map — they render as-is in both languages.
 */
interface DocLabels {
  // Chrome
  htmlLang: string;
  title: string;
  agent: string;
  summary: string;
  projectLabel: string;
  generatedOnLabel: string;
  footerGeneratedBy: string;
  // QA table header
  paramQuestion: string;
  value: string;
  comments: string;
  // Servers section
  serversNodes: string;
  openstackConfig: string;
  nodeInventory: string;
  authUrl: string;
  credentialId: string;
  novaEndpoint: string;
  caCertificate: string;
  secret: string;
  secretStored: string;
  secretNotConfigured: string;
  noOpenstackConfig: string;
}

/** Document label vocabulary per supported language. */
const DOC_LABELS: Record<Language, DocLabels> = {
  fr: {
    htmlLang: 'fr',
    title: "Document d'architecture",
    agent: 'Oracle AI — Shai Agent',
    summary: 'Sommaire',
    projectLabel: 'Projet',
    generatedOnLabel: 'Généré le',
    footerGeneratedBy: 'Généré par',
    paramQuestion: 'Paramètre / Question',
    value: 'Valeur',
    comments: 'Commentaires / Détails',
    serversNodes: 'Servers nodes',
    openstackConfig: 'Configuration OpenStack',
    nodeInventory: 'Inventaire des nœuds serveurs',
    authUrl: 'Auth URL',
    credentialId: 'Credential ID',
    novaEndpoint: 'Nova endpoint',
    caCertificate: 'Certificat CA',
    secret: 'Secret',
    secretStored: 'Enregistré (non exporté)',
    secretNotConfigured: 'Non configuré',
    noOpenstackConfig: 'Aucune configuration OpenStack enregistrée.',
  },
  en: {
    htmlLang: 'en',
    title: 'Architecture document',
    agent: 'Oracle AI — Shai Agent',
    summary: 'Summary',
    projectLabel: 'Project',
    generatedOnLabel: 'Generated on',
    footerGeneratedBy: 'Generated by',
    paramQuestion: 'Parameter / Question',
    value: 'Value',
    comments: 'Comments / Details',
    serversNodes: 'Servers nodes',
    openstackConfig: 'OpenStack configuration',
    nodeInventory: 'Server node inventory',
    authUrl: 'Auth URL',
    credentialId: 'Credential ID',
    novaEndpoint: 'Nova endpoint',
    caCertificate: 'CA certificate',
    secret: 'Secret',
    secretStored: 'Stored (not exported)',
    secretNotConfigured: 'Not configured',
    noOpenstackConfig: 'No OpenStack configuration saved.',
  },
};

/** Render one question row into a table row of the architecture document. */
const renderRow = (
  row: QuestionRow,
  answer: string | undefined,
  _labels: DocLabels,
): string => {
  const marker = row.mandatory ? '🔴' : '⚪';
  const value = (answer ?? '').trim();
  const valueCell = value
    ? escapeHtml(value)
    : '<span class="muted">—</span>';
  const comments = row.commentsHint ?? '';
  return `
        <tr>
          <td class="marker">${marker}</td>
          <td>
            <div class="q">${escapeHtml(row.questionPrimary)}</div>
            ${row.questionSecondary ? `<div class="q2">${escapeHtml(row.questionSecondary)}</div>` : ''}
          </td>
          <td class="value">${valueCell}</td>
          ${comments ? `<td class="example">${escapeHtml(comments)}</td>` : '<td class="example muted">—</td>'}
        </tr>`;
};

/** Render one QA tab (config + answers) into a section of the document. */
const renderQaSection = (
  title: string,
  config: QuestionFormConfig,
  answers: Record<string, string>,
  labels: DocLabels,
): string => {
  const sections = config.sections
    .map((section) => {
      const rows = section.rows
        .map((row) => renderRow(row, answers[row.id], labels))
        .join('');
      return `
      <h3>${escapeHtml(section.title)}</h3>
      <table>
        <thead>
          <tr>
            <th class="marker"></th>
            <th>${labels.paramQuestion}</th>
            <th>${labels.value}</th>
            <th>${labels.comments}</th>
          </tr>
        </thead>
        <tbody>${rows}
        </tbody>
      </table>`;
    })
    .join('');

  return `
    <section>
      <h2>${escapeHtml(title)}</h2>
      ${sections}
    </section>`;
};

/** Render the server-node inventory into a section of the document. */
const renderServersSection = (
  nodes: ReadonlyArray<ServerNode>,
  credentials: InstallationExport['servers']['credentials'],
  labels: DocLabels,
): string => {
  const rows = nodes
    .map(
      (node) => `
        <tr>
          <td class="mono">${escapeHtml(node.nodeUuid)}</td>
          <td class="mono">${escapeHtml(node.serialNumber)}</td>
          <td class="mono">${node.instanceUuid ? escapeHtml(node.instanceUuid) : '<span class="muted">—</span>'}</td>
          <td>${escapeHtml(node.powerState) || '<span class="muted">—</span>'}</td>
          <td>${escapeHtml(node.provisionState) || '<span class="muted">—</span>'}</td>
          <td>${node.remark ? escapeHtml(node.remark) : '<span class="muted">—</span>'}</td>
        </tr>`,
    )
    .join('');

  const credBlock = credentials
    ? `
      <table class="cred">
        <tbody>
          <tr><th>${labels.authUrl}</th><td class="mono">${escapeHtml(credentials.auth_url) || '<span class="muted">—</span>'}</td></tr>
          <tr><th>${labels.credentialId}</th><td class="mono">${escapeHtml(credentials.credential_id) || '<span class="muted">—</span>'}</td></tr>
          <tr><th>${labels.novaEndpoint}</th><td class="mono">${escapeHtml(credentials.nova_endpoint) || '<span class="muted">—</span>'}</td></tr>
          <tr><th>${labels.caCertificate}</th><td class="mono">${credentials.ca_certificate ? escapeHtml(credentials.ca_certificate) : '<span class="muted">—</span>'}</td></tr>
          <tr><th>${labels.secret}</th><td>${credentials.secret_stored ? labels.secretStored : labels.secretNotConfigured}</td></tr>
        </tbody>
      </table>`
    : `<p class="muted">${labels.noOpenstackConfig}</p>`;

  return `
    <section>
      <h2>${labels.serversNodes}</h2>
      <h3>${labels.openstackConfig}</h3>
      ${credBlock}
      <h3>${labels.nodeInventory}</h3>
      <table>
        <thead>
          <tr>
            <th>Node UUID</th>
            <th>Serial Number</th>
            <th>Instance UUID</th>
            <th>Power State</th>
            <th>Provision State</th>
            <th>Remark</th>
          </tr>
        </thead>
        <tbody>${rows}
        </tbody>
      </table>
    </section>`;
};

/**
 * Assemble the full architecture-document HTML string in the given language.
 * `language` defaults to French so callers (and legacy tests) that omit it get
 * the original French document.
 */
export const buildArchitectureDocumentHtml = (
  data: InstallationExport,
  language: Language = 'fr',
): string => {
  const labels = DOC_LABELS[language];
  const generatedAt = new Date().toLocaleString();
  const qaSections = QA_CATEGORIES.map((category) =>
    renderQaSection(
      category.title,
      category.config as QuestionFormConfig,
      data.tabs[category.slug] ?? {},
      labels,
    ),
  ).join('');
  const serversSection = renderServersSection(
    data.servers.nodes,
    data.servers.credentials,
    labels,
  );

  const toc = CHECKLIST_CATEGORIES.map(
    (category) => `<li>${escapeHtml(category.title)}</li>`,
  ).join('');

  return `<!DOCTYPE html>
<html lang="${labels.htmlLang}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${labels.title} — ${escapeHtml(data.installation.project_name)}</title>
<style>
  :root { --brand: #000E9C; --brand2: #4949FF; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1f2937; margin: 0; padding: 0; background: #fff; }
  .wrap { max-width: 960px; margin: 0 auto; padding: 40px 32px; }
  header { border-bottom: 4px solid var(--brand); padding-bottom: 16px; margin-bottom: 24px; }
  .agent { font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--brand2); font-weight: 700; }
  h1 { color: var(--brand); font-size: 28px; margin: 6px 0 4px; }
  .meta { color: #6b7280; font-size: 13px; }
  nav { background: #f8fafc; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px 20px; margin-bottom: 28px; }
  nav h4 { margin: 0 0 6px; color: var(--brand); font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em; }
  nav ol { margin: 0; padding-left: 20px; color: #374151; font-size: 14px; }
  section { margin-bottom: 36px; }
  h2 { color: var(--brand); font-size: 20px; border-bottom: 2px solid #e5e7eb; padding-bottom: 6px; margin-top: 32px; }
  h3 { color: #111827; font-size: 15px; margin: 20px 0 8px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 12px; font-size: 13px; }
  th, td { border: 1px solid #e5e7eb; padding: 7px 9px; text-align: left; vertical-align: top; }
  thead th { background: #eef2ff; color: var(--brand); font-size: 12px; text-transform: uppercase; letter-spacing: 0.03em; }
  td.marker, th.marker { width: 28px; text-align: center; }
  td.value { font-weight: 600; color: #111827; width: 24%; }
  td.example { color: #6b7280; width: 26%; }
  .q { font-weight: 600; color: #1f2937; }
  .q2 { color: #6b7280; font-size: 12px; margin-top: 2px; }
  .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; word-break: break-all; }
  .muted { color: #9ca3af; }
  table.cred th { background: #f8fafc; width: 160px; color: #374151; }
  footer { border-top: 1px solid #e5e7eb; margin-top: 40px; padding-top: 14px; color: #9ca3af; font-size: 12px; text-align: center; }
  @media print { .wrap { padding: 0; } nav { break-inside: avoid; } section { break-inside: avoid-page; } }
</style>
</head>
<body>
  <div class="wrap">
    <header>
      <div class="agent">${labels.agent}</div>
      <h1>${labels.title}</h1>
      <div class="meta">
        ${labels.projectLabel} : <strong>${escapeHtml(data.installation.project_name)}</strong><br />
        ${labels.generatedOnLabel} : ${escapeHtml(generatedAt)}
      </div>
    </header>

    <nav>
      <h4>${labels.summary}</h4>
      <ol>${toc}</ol>
    </nav>

    ${qaSections}
    ${serversSection}

    <footer>
      ${labels.footerGeneratedBy} ${labels.agent} · OPCP · ${escapeHtml(data.exported_at.slice(0, 10))}
    </footer>
  </div>
</body>
</html>`;
};

/**
 * Generate and download the "Oracle AI — Shai Agent" architecture document for
 * an installation. It fetches the current values across every tab (reusing the
 * export builder) and renders them, together with the server-node list, into a
 * self-contained HTML file the browser downloads.
 */
export const generateArchitectureDocument = async (
  installation: Installation,
  language: Language = 'fr',
): Promise<void> => {
  const data = await buildInstallationExport(installation);
  const date = data.exported_at.slice(0, 10);
  const filename = `${safeSlug(installation.project_name)}-architecture-${date}.html`;
  downloadFile(
    filename,
    buildArchitectureDocumentHtml(data, language),
    'text/html;charset=utf-8',
  );
};

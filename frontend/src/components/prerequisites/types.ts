export type Status = 'received' | 'pending' | 'blocked' | 'na';

export interface StatusMeta {
  value: Status;
  label: string;
  icon: string;
}

export const STATUS_OPTIONS: StatusMeta[] = [
  { value: 'received', label: 'Reçu', icon: '✅' },
  { value: 'pending', label: 'En attente', icon: '⏳' },
  { value: 'blocked', label: 'Bloqué', icon: '❌' },
  { value: 'na', label: 'N/A', icon: '—' },
];

// Static description of a parameter row (from config)
export interface ParameterRow {
  id: string; // stable key, unique within a page
  label: string; // French label shown to the coordinator
  defaultValue?: string;
}

export interface SubSection {
  id: string;
  title: string; // French sub-section heading
  rows: ParameterRow[];
}

export interface FormConfig {
  sections: SubSection[];
}

// Editable per-row state (persisted)
export interface RowState {
  value: string;
  status: Status;
  dateReceived: string; // ISO yyyy-mm-dd or ''
  comments: string;
}

export type RowField = keyof RowState;

// Persisted shape: rowId -> RowState
export type FormState = Record<string, RowState>;

// Shared navigation config for the prerequisites dropdown (desktop + mobile)
export interface PrereqNavItem {
  label: string;
  route: string; // always `/prerequisites/${slug}`
  archetype: 'how-to-use' | 'static' | 'qa';
}

export const PREREQ_NAV_ITEMS = [
  { label: 'How to use', route: '/prerequisites/how-to-use', archetype: 'how-to-use' },
  { label: 'Basics', route: '/prerequisites/basics', archetype: 'static' },
  { label: 'Network Checklist', route: '/prerequisites/network-checklist', archetype: 'qa' },
  { label: 'Core Control Plane', route: '/prerequisites/core-control-plane', archetype: 'qa' },
  { label: 'CloudStore', route: '/prerequisites/cloudstore', archetype: 'qa' },
  { label: 'VCF', route: '/prerequisites/vcf', archetype: 'qa' },
  { label: 'Network Flux', route: '/prerequisites/network-flux', archetype: 'static' },
] as const satisfies readonly PrereqNavItem[];

// Shared marker legend used by the How-to-use legend and per-row markers on
// question/answer pages so they stay consistent.
export const PREREQ_MARKERS = {
  mandatory: { label: 'Obligatoire', icon: '🔴' },
  optional: { label: 'Optionnel', icon: '⚪' },
} as const;
// ---------------------------------------------------------------------------
// Question-archetype data models (Network Checklist, Core Control Plane,
// CloudStore, VCF). These live alongside the legacy ParameterRow/SubSection/
// FormConfig types, which are retained unchanged for TrackingForm.
// ---------------------------------------------------------------------------

// A single question row: two read-only question columns plus per-row metadata
// and an editable Client answer (persisted separately as ClientAnswers).
export interface QuestionRow {
  id: string; // stable, unique within a page
  questionPrimary: string; // read-only question column 1
  questionSecondary?: string; // read-only question column 2
  mandatory: boolean; // drives the Mandatory/Optional marker
  exampleValue?: string; // example value shown to the customer
  commentsHint?: string; // Comments/Details hint
}

export interface QuestionSection {
  id: string;
  title: string;
  rows: QuestionRow[];
}

export interface QuestionFormConfig {
  sections: QuestionSection[];
}

// Static-content model: a single HTML/markdown string persisted per slug.
export interface StaticContent {
  slug: string;
  content: string;
  updatedAt?: string;
}

// Client-answer model: a rowId -> answer map persisted per slug.
export interface ClientAnswers {
  slug: string;
  answers: Record<string, string>;
}

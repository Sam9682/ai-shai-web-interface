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
export const PREREQ_NAV_ITEMS = [
  { label: 'OPCP Core', route: '/prerequisites/opcp-core' },
  { label: 'CloudStore', route: '/prerequisites/cloudstore' },
  { label: 'LandingZone', route: '/prerequisites/landingzone' },
] as const;

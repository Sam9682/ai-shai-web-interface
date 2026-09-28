import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { render, screen, cleanup, within, act } from '@testing-library/react';
import type React from 'react';
import fc from 'fast-check';
import { ServersTable } from './ServersTable';
import type { ServerNode } from './serversData';
import { SERVER_NODES } from './serversData';
import { LanguageProvider } from '../../hooks/useLanguage';
import { prerequisitesService } from '../../services/prerequisitesService';

// The credentials form (rendered only when `installationId` is set) loads the
// stored config on mount. Mock the service so the static-table preservation
// case below can mount the form without hitting the network. The pre-existing
// tests below never render the form, so this mock does not affect them.
vi.mock('../../services/prerequisitesService', () => ({
  SERVERS_SLUG: 'servers-nodes',
  prerequisitesService: {
    loadCredentialConfig: vi.fn(),
    saveCredentialConfig: vi.fn(),
    retrieveServers: vi.fn(),
  },
}));

const mockedPrereq = vi.mocked(prerequisitesService);

// ===========================================================================
// Bugfix spec: opcp-installations-response-fields-editable (task 2)
// Property 2: Preservation — the "Servers nodes" tab stays a read-only
// inventory with NO editable "Réponse client" fields.
//
// The admin-editable fix touches only QuestionAnswerForm (QA tabs) and the
// backend answer authorization; it does NOT touch ServersTable. This test pins
// the OBSERVED unfixed behavior so it is provably unchanged: the Servers tab
// renders an inventory table with no form controls at all, and specifically no
// "Réponse client" label/input.
//
// EXPECTED OUTCOME on unfixed code: PASS (baseline to preserve).
//
// Validates: Requirement 3.5
// ===========================================================================

afterEach(() => {
  cleanup();
});

// Generate arbitrary, well-formed server node inventories so the property holds
// for any data set, not just the built-in inventory.
const serverNodeArb: fc.Arbitrary<ServerNode> = fc.record({
  nodeUuid: fc.string(),
  serialNumber: fc.string(),
  instanceUuid: fc.string(),
  powerState: fc.constantFrom('power on', 'power off', 'None', ''),
  provisionState: fc.constantFrom('active', 'available', 'enroll', ''),
  remark: fc.string(),
});

// ServersTable keys its rows on `node.nodeUuid`, so give each generated node a
// unique nodeUuid (the property under test is about controls/structure, not the
// UUID text). This keeps React from emitting duplicate-key warnings for the
// arbitrary data while still exercising arbitrary inventories.
const nodesArb: fc.Arbitrary<ServerNode[]> = fc
  .array(serverNodeArb, { minLength: 0, maxLength: 6 })
  .map((nodes) => nodes.map((node, i) => ({ ...node, nodeUuid: `node-${i}-${node.nodeUuid}` })));

describe('Property 2 (preservation): Servers nodes tab is a read-only inventory', () => {
  it('renders no editable "Réponse client" control for any generated inventory', () => {
    fc.assert(
      fc.property(nodesArb, (nodes) => {
        cleanup();
        render(<ServersTable title="Servers nodes" nodes={nodes} />);

        // No "Réponse client" label/input exists on the Servers tab.
        expect(screen.queryByLabelText(/Réponse client/)).toBeNull();

        // No form controls at all: the inventory is display-only.
        expect(screen.queryAllByRole('textbox')).toHaveLength(0);
        expect(document.querySelectorAll('input, textarea, select')).toHaveLength(0);

        cleanup();
      }),
      { numRuns: 100 },
    );
  });

  it('renders the inventory as a table (structural read-only presentation)', () => {
    fc.assert(
      fc.property(nodesArb, (nodes) => {
        cleanup();
        render(<ServersTable title="Servers nodes" nodes={nodes} />);

        const table = screen.getByRole('table');
        expect(table).toBeInTheDocument();
        // The six inventory columns are present as header cells.
        const headers = within(table).getAllByRole('columnheader');
        expect(headers).toHaveLength(6);

        cleanup();
      }),
      { numRuns: 100 },
    );
  });

  it('renders the built-in inventory with no editable "Réponse client" fields', () => {
    render(<ServersTable title="Servers nodes" nodes={SERVER_NODES} />);
    expect(screen.queryByLabelText(/Réponse client/)).toBeNull();
    expect(document.querySelectorAll('input, textarea, select')).toHaveLength(0);
    expect(screen.getByRole('table')).toBeInTheDocument();
  });
});

// ===========================================================================
// Feature spec: openstack-node-status (task 9.5)
// Requirement 1.4: The Servers_Table_Component SHALL continue to render the
// existing static servers table when the Credentials_Form (and Live_Results
// section) are present.
//
// When `installationId` is set the credentials form renders ABOVE the static
// inventory; this test pins that the static six-column inventory table still
// renders alongside the form. Validates: Requirement 1.4
// ===========================================================================

const INSTALL_ID = '33333333-3333-3333-3333-333333333333';
const CREDENTIALS_TITLE = 'Identifiants OpenStack';
const RETRIEVE_LABEL = 'RÉCUPÉRER LES INFOS';

function renderWithProvider(ui: React.ReactElement) {
  return render(<LanguageProvider>{ui}</LanguageProvider>);
}

describe('Requirement 1.4 (preservation): static table renders alongside the credentials form', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockedPrereq.loadCredentialConfig.mockResolvedValue({
      auth_url: '',
      credential_id: '',
      nova_endpoint: '',
      ca_certificate: '',
      secret_stored: false,
    });
  });

  it('renders the six-column static inventory table together with the credentials form', async () => {
    renderWithProvider(
      <ServersTable
        title="Servers nodes"
        nodes={SERVER_NODES}
        installationId={INSTALL_ID}
      />,
    );
    // Let the mount-time loadCredentialConfig promise resolve.
    await act(async () => {
      await Promise.resolve();
    });

    // The credentials form is present (title + RETRIEVE INFO button).
    expect(
      screen.getByRole('heading', { name: CREDENTIALS_TITLE }),
    ).toBeInTheDocument();
    expect(screen.getByText(RETRIEVE_LABEL)).toBeInTheDocument();

    // The static inventory table still renders: find the table whose header row
    // carries the six inventory columns (Node UUID, Serial Number, ...).
    const tables = screen.getAllByRole('table');
    const staticTable = tables.find(
      (table) => within(table).queryByText('Node UUID') !== null,
    );
    expect(staticTable).toBeDefined();

    const headers = within(staticTable as HTMLElement).getAllByRole('columnheader');
    expect(headers).toHaveLength(6);
    expect(within(staticTable as HTMLElement).getByText('Serial Number')).toBeInTheDocument();
    expect(within(staticTable as HTMLElement).getByText('Provision State')).toBeInTheDocument();

    // Every built-in inventory row is present in the static table.
    for (const node of SERVER_NODES) {
      expect(
        within(staticTable as HTMLElement).getByText(node.nodeUuid),
      ).toBeInTheDocument();
    }
  });
});

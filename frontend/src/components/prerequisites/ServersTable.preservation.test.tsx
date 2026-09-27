import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import fc from 'fast-check';
import { ServersTable } from './ServersTable';
import type { ServerNode } from './serversData';
import { SERVER_NODES } from './serversData';

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

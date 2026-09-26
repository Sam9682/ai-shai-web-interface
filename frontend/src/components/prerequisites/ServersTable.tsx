import { SERVER_NODES, type ServerNode } from './serversData';

interface ServersTableProps {
  title: string;
  /**
   * `card` (default) renders the standalone card wrapper and page heading.
   * `embedded` drops the outer card and `<h1>` so the table can be hosted
   * inside a tab panel that already provides both.
   */
  variant?: 'card' | 'embedded';
  /** Server rows to display. Defaults to the built-in inventory. */
  nodes?: ReadonlyArray<ServerNode>;
}

const PLACEHOLDER = '—';

const HEAD_CELL =
  'px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-[#000E9C] border-b border-gray-200 whitespace-nowrap';

const BODY_CELL = 'px-3 py-2 text-sm text-gray-700 border-b border-gray-100 align-top';

/** Tailwind classes for a small status pill, keyed on the normalized state. */
const powerStateClass = (state: string): string => {
  const normalized = state.trim().toLowerCase();
  if (normalized === 'power on') return 'bg-green-100 text-green-800';
  if (normalized === 'power off') return 'bg-gray-200 text-gray-700';
  return 'bg-amber-100 text-amber-800';
};

const provisionStateClass = (state: string): string => {
  const normalized = state.trim().toLowerCase();
  if (normalized === 'active') return 'bg-green-100 text-green-800';
  if (normalized === 'available') return 'bg-blue-100 text-blue-800';
  return 'bg-amber-100 text-amber-800';
};

const StatePill = ({ value, className }: { value: string; className: string }) =>
  value.trim() ? (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${className}`}
    >
      {value}
    </span>
  ) : (
    <span className="text-gray-400">{PLACEHOLDER}</span>
  );

const MonoCell = ({ value }: { value: string }) =>
  value.trim() ? (
    <span className="font-mono text-xs">{value}</span>
  ) : (
    <span className="text-gray-400">{PLACEHOLDER}</span>
  );

/**
 * Read-only inventory of server nodes for the "Servers nodes" prerequisites
 * tab. Coordinators consult it to pick an available Node UUID when filling in
 * the CloudStore / Core Control Plane forms.
 */
export const ServersTable = ({
  title,
  variant = 'card',
  nodes = SERVER_NODES,
}: ServersTableProps) => {
  const embedded = variant === 'embedded';

  const body = (
    <>
      {embedded ? (
        <h2 className="text-2xl font-bold text-[#000E9C] mb-5">{title}</h2>
      ) : (
        <h1 className="text-2xl font-bold text-[#000E9C] mb-5">{title}</h1>
      )}

      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse">
          <thead>
            <tr>
              <th scope="col" className={HEAD_CELL}>
                Node UUID
              </th>
              <th scope="col" className={HEAD_CELL}>
                Serial Number
              </th>
              <th scope="col" className={HEAD_CELL}>
                Instance UUID
              </th>
              <th scope="col" className={HEAD_CELL}>
                Power State
              </th>
              <th scope="col" className={HEAD_CELL}>
                Provision State
              </th>
              <th scope="col" className={HEAD_CELL}>
                Remark
              </th>
            </tr>
          </thead>
          <tbody>
            {nodes.map((node) => (
              <tr key={node.nodeUuid} className="hover:bg-gray-50">
                <td className={BODY_CELL}>
                  <MonoCell value={node.nodeUuid} />
                </td>
                <td className={BODY_CELL}>
                  <MonoCell value={node.serialNumber} />
                </td>
                <td className={BODY_CELL}>
                  <MonoCell value={node.instanceUuid} />
                </td>
                <td className={BODY_CELL}>
                  <StatePill
                    value={node.powerState}
                    className={powerStateClass(node.powerState)}
                  />
                </td>
                <td className={BODY_CELL}>
                  <StatePill
                    value={node.provisionState}
                    className={provisionStateClass(node.provisionState)}
                  />
                </td>
                <td className={BODY_CELL}>
                  {node.remark.trim() ? (
                    node.remark
                  ) : (
                    <span className="text-gray-400">{PLACEHOLDER}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );

  if (embedded) {
    return body;
  }

  return <div className="card p-6">{body}</div>;
};

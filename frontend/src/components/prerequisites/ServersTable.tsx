import { useEffect, useMemo, useState } from 'react';
import { SERVER_NODES, type ServerNode } from './serversData';
import { useTranslation } from '../../hooks/useLanguage';
import { prerequisitesService } from '../../services/prerequisitesService';
import type {
  NovaServer,
  SaveCredentialConfigRequest,
} from '../../services/prerequisitesService';

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
  /**
   * When present, enables the OpenStack live-retrieval credentials form (and,
   * from task 9.2, the live results section) above the unchanged static table.
   */
  installationId?: string;
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

const CRED_FIELD_CLASS =
  'w-full px-3 py-2 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-[#4949FF] focus:border-transparent';

/** Which required field failed client-side validation, keyed to its i18n message. */
type CredentialsValidationKey =
  | 'prereq.servers.validation.authUrlRequired'
  | 'prereq.servers.validation.credentialIdRequired'
  | 'prereq.servers.validation.novaEndpointRequired'
  | 'prereq.servers.validation.secretRequired';

interface CredentialsFormState {
  authUrl: string;
  credentialId: string;
  credentialSecret: string;
  novaEndpoint: string;
  caCertificate: string;
}

/**
 * Validate the credentials form before a retrieval is attempted.
 *
 * Retrieval is gated when any required non-secret field (auth URL, credential
 * id, Nova endpoint) is empty, or when the secret is empty while none is stored
 * server-side (`secretStored === false`). Returns the i18n key of the first
 * failing rule, or `null` when the form is valid.
 */
export const validateCredentialsForm = (
  state: CredentialsFormState,
  secretStored: boolean,
): CredentialsValidationKey | null => {
  if (!state.authUrl.trim()) return 'prereq.servers.validation.authUrlRequired';
  if (!state.credentialId.trim()) return 'prereq.servers.validation.credentialIdRequired';
  if (!state.novaEndpoint.trim()) return 'prereq.servers.validation.novaEndpointRequired';
  if (!state.credentialSecret.trim() && !secretStored) {
    return 'prereq.servers.validation.secretRequired';
  }
  return null;
};

/**
 * Build the save/retrieve payload from the current form state. The secret is
 * only included when the operator typed one; an empty secret is omitted so the
 * backend reuses the stored value.
 */
const toSaveRequest = (state: CredentialsFormState): SaveCredentialConfigRequest => {
  const request: SaveCredentialConfigRequest = {
    auth_url: state.authUrl.trim(),
    credential_id: state.credentialId.trim(),
    nova_endpoint: state.novaEndpoint.trim(),
    ca_certificate: state.caCertificate.trim(),
  };
  if (state.credentialSecret.trim()) {
    request.credential_secret = state.credentialSecret;
  }
  return request;
};

/** i18n keys for the error banner, keyed by the backend error code. */
type ErrorMessageKey =
  | 'prereq.servers.error.invalidCredentials'
  | 'prereq.servers.error.connection'
  | 'prereq.servers.error.openstack'
  | 'prereq.servers.error.invalidCaCertificate'
  | 'prereq.servers.error.generic';

/** Map a backend `ErrorResponse` code to the localized message key. */
const ERROR_CODE_TO_KEY: Record<string, ErrorMessageKey> = {
  AUTH_FAILED: 'prereq.servers.error.invalidCredentials',
  CONNECTION_FAILED: 'prereq.servers.error.connection',
  OPENSTACK_ERROR: 'prereq.servers.error.openstack',
  INVALID_CA_CERTIFICATE: 'prereq.servers.error.invalidCaCertificate',
};

/**
 * Extract the backend error code from an axios error. Router errors use the
 * shared `ErrorResponse.create(code, message, details)` contract, which the
 * app's exception handler unwraps to a top-level `{ error: { code } }` body;
 * the raw `{ detail: { error: { code } } }` shape is the fallback when the
 * handler is not applied. Returns `null` when no code can be found.
 */
const extractErrorCode = (error: unknown): string | null => {
  const data = (
    error as { response?: { data?: unknown } } | undefined
  )?.response?.data;
  if (!data || typeof data !== 'object') return null;
  const record = data as {
    error?: { code?: unknown };
    detail?: { error?: { code?: unknown } };
  };
  const topLevel = record.error?.code;
  if (typeof topLevel === 'string') return topLevel;
  const nested = record.detail?.error?.code;
  if (typeof nested === 'string') return nested;
  return null;
};

/** Resolve a backend error into the localized message key (with fallback). */
const toErrorMessageKey = (error: unknown): ErrorMessageKey => {
  const code = extractErrorCode(error);
  if (code && code in ERROR_CODE_TO_KEY) return ERROR_CODE_TO_KEY[code];
  return 'prereq.servers.error.generic';
};

interface CredentialsFormProps {
  installationId: string;
}

/**
 * OpenStack credentials form shown above the static inventory when an
 * `installationId` is supplied. Collects the Keystone auth URL, credential id,
 * a masked write-only secret, and the Nova endpoint, and exposes a RETRIEVE
 * INFO button gated by client-side validation.
 *
 * On mount it prefills the non-secret fields from the stored config and records
 * whether a secret is already stored (so the secret field can stay optional).
 * The actual retrieval flow + live results are wired in task 9.2; this task
 * establishes the form, prefill, and validation, and leaves a clear hook for
 * that follow-up.
 */
const CredentialsForm = ({ installationId }: CredentialsFormProps) => {
  const { t } = useTranslation();
  const [form, setForm] = useState<CredentialsFormState>({
    authUrl: '',
    credentialId: '',
    credentialSecret: '',
    novaEndpoint: '',
    caCertificate: '',
  });
  const [secretStored, setSecretStored] = useState(false);
  const [validationKey, setValidationKey] = useState<CredentialsValidationKey | null>(
    null,
  );
  // Live-retrieval state. `servers` is null until the first successful
  // retrieve so the results table stays hidden while nothing has been fetched.
  const [loading, setLoading] = useState(false);
  const [errorKey, setErrorKey] = useState<ErrorMessageKey | null>(null);
  const [servers, setServers] = useState<NovaServer[] | null>(null);

  // Prefill non-secret fields on mount (and whenever the installation changes).
  // The secret is never returned by the backend; only `secret_stored` reports
  // whether one exists.
  useEffect(() => {
    let cancelled = false;
    prerequisitesService
      .loadCredentialConfig(installationId)
      .then((cfg) => {
        if (cancelled) return;
        setForm((prev) => ({
          ...prev,
          authUrl: cfg.auth_url ?? '',
          credentialId: cfg.credential_id ?? '',
          novaEndpoint: cfg.nova_endpoint ?? '',
          caCertificate: cfg.ca_certificate ?? '',
        }));
        setSecretStored(Boolean(cfg.secret_stored));
      })
      .catch(() => {
        // No stored config yet (or load failed): leave fields empty and treat
        // the secret as not stored so validation still requires one.
        if (!cancelled) setSecretStored(false);
      });
    return () => {
      cancelled = true;
    };
  }, [installationId]);

  const setField = (field: keyof CredentialsFormState) => (value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    // Clear a stale validation message as soon as the operator edits a field.
    setValidationKey(null);
  };

  const handleRetrieve = () => {
    const failure = validateCredentialsForm(form, secretStored);
    if (failure) {
      setValidationKey(failure);
      return;
    }
    if (loading) return; // Ignore re-clicks while a request is in flight.
    setValidationKey(null);
    setErrorKey(null);
    setLoading(true);

    // A single call persists the config (+ optional secret) and retrieves the
    // live server list; a successful response replaces any prior rows.
    prerequisitesService
      .retrieveServers(installationId, toSaveRequest(form))
      .then((result) => {
        setServers(result.servers ?? []);
        // The secret (if any) was just persisted server-side, so future
        // retrievals no longer require it.
        if (form.credentialSecret.trim()) setSecretStored(true);
      })
      .catch((error) => {
        setErrorKey(toErrorMessageKey(error));
      })
      .finally(() => {
        setLoading(false);
      });
  };

  const fields = useMemo(
    () =>
      [
        {
          id: 'openstack-auth-url',
          label: t('prereq.servers.credentials.authUrl'),
          key: 'authUrl' as const,
          type: 'text',
        },
        {
          id: 'openstack-credential-id',
          label: t('prereq.servers.credentials.credentialId'),
          key: 'credentialId' as const,
          type: 'text',
        },
        {
          id: 'openstack-credential-secret',
          label: t('prereq.servers.credentials.credentialSecret'),
          key: 'credentialSecret' as const,
          type: 'password',
        },
        {
          id: 'openstack-nova-endpoint',
          label: t('prereq.servers.credentials.novaEndpoint'),
          key: 'novaEndpoint' as const,
          type: 'text',
        },
      ] as const,
    [t],
  );

  return (
    <section className="mb-8 rounded border border-gray-200 bg-gray-50 p-4">
      <h3 className="mb-4 text-lg font-semibold text-[#000E9C]">
        {t('prereq.servers.credentials.title')}
      </h3>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {fields.map((field) => (
          <div key={field.id}>
            <label
              htmlFor={field.id}
              className="mb-1 block text-xs font-medium text-gray-500"
            >
              {field.label}
            </label>
            <input
              id={field.id}
              type={field.type}
              value={form[field.key]}
              onChange={(e) => setField(field.key)(e.target.value)}
              className={CRED_FIELD_CLASS}
            />
            {field.key === 'credentialSecret' && secretStored && (
              <p className="mt-1 text-xs text-green-700">
                {t('prereq.servers.credentials.secretStored')}
              </p>
            )}
          </div>
        ))}
      </div>

      <div className="mt-4">
        <label
          htmlFor="openstack-ca-certificate"
          className="mb-1 block text-xs font-medium text-gray-500"
        >
          {t('prereq.servers.credentials.caCertificate')}
        </label>
        <textarea
          id="openstack-ca-certificate"
          rows={6}
          value={form.caCertificate}
          onChange={(e) => setField('caCertificate')(e.target.value)}
          className={`${CRED_FIELD_CLASS} font-mono`}
        />
      </div>

      {validationKey && (
        <p role="alert" className="mt-3 text-sm text-red-600">
          {t(validationKey)}
        </p>
      )}

      <div className="mt-4">
        <button
          type="button"
          onClick={handleRetrieve}
          disabled={loading}
          className="rounded bg-[#000E9C] px-4 py-2 text-sm font-semibold text-white hover:bg-[#000B7A] focus:outline-none focus:ring-2 focus:ring-[#4949FF] focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {t('prereq.servers.retrieve')}
        </button>
      </div>

      <LiveResultsSection loading={loading} errorKey={errorKey} servers={servers} />
    </section>
  );
};

interface LiveResultsSectionProps {
  loading: boolean;
  errorKey: ErrorMessageKey | null;
  /** `null` before the first retrieve; an array (possibly empty) afterwards. */
  servers: NovaServer[] | null;
}

/**
 * Live server-status output shown below the credentials form: a loading
 * indicator while a retrieve is pending, an error banner keyed by the backend
 * error code, or a table of `{ id, name, status }` rows once a retrieve
 * succeeds. Nothing renders before the first retrieval attempt.
 */
const LiveResultsSection = ({ loading, errorKey, servers }: LiveResultsSectionProps) => {
  const { t } = useTranslation();

  if (loading) {
    return (
      <p role="status" className="mt-4 text-sm text-gray-600">
        {t('prereq.servers.retrieving')}
      </p>
    );
  }

  if (errorKey) {
    return (
      <p role="alert" className="mt-4 rounded bg-red-50 px-3 py-2 text-sm text-red-700">
        {t(errorKey)}
      </p>
    );
  }

  if (servers === null) return null;

  return (
    <div className="mt-6">
      <h4 className="mb-3 text-base font-semibold text-[#000E9C]">
        {t('prereq.servers.results.title')}
      </h4>
      {servers.length === 0 ? (
        <p className="text-sm text-gray-500">{t('prereq.servers.results.empty')}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse">
            <thead>
              <tr>
                <th scope="col" className={HEAD_CELL}>
                  {t('prereq.servers.results.colId')}
                </th>
                <th scope="col" className={HEAD_CELL}>
                  {t('prereq.servers.results.colName')}
                </th>
                <th scope="col" className={HEAD_CELL}>
                  {t('prereq.servers.results.colStatus')}
                </th>
              </tr>
            </thead>
            <tbody>
              {servers.map((server) => (
                <tr key={server.id} className="hover:bg-gray-50">
                  <td className={BODY_CELL}>
                    <MonoCell value={server.id} />
                  </td>
                  <td className={BODY_CELL}>{server.name.trim() || PLACEHOLDER}</td>
                  <td className={BODY_CELL}>
                    <StatePill
                      value={server.status}
                      className={provisionStateClass(server.status)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

/**
 * Read-only inventory of server nodes for the "Servers nodes" prerequisites
 * tab. Coordinators consult it to pick an available Node UUID when filling in
 * the CloudStore / Core Control Plane forms.
 */
export const ServersTable = ({
  title,
  variant = 'card',
  nodes = SERVER_NODES,
  installationId,
}: ServersTableProps) => {
  const embedded = variant === 'embedded';

  const body = (
    <>
      {embedded ? (
        <h2 className="text-2xl font-bold text-[#000E9C] mb-5">{title}</h2>
      ) : (
        <h1 className="text-2xl font-bold text-[#000E9C] mb-5">{title}</h1>
      )}

      {installationId && <CredentialsForm installationId={installationId} />}

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

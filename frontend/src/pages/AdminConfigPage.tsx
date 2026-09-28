import { useState, useEffect, useCallback } from 'react';
import { adminService, type LoginLogEntry, type AIProviderStatus, type AIProviderId } from '../services/adminService';
import { useTranslation } from '../hooks/useLanguage';

const PAGE_SIZE = 50;

/** Map a backend connection action to a translated, styled label. */
const eventLabelKey: Record<string, string> = {
  LOGIN_SUCCESS: 'page.adminConfig.event.login',
  LOGOUT: 'page.adminConfig.event.logout',
  LOGIN_FAILED: 'page.adminConfig.event.failed',
};

const eventBadgeClass: Record<string, string> = {
  LOGIN_SUCCESS: 'bg-green-100 text-green-800',
  LOGOUT: 'bg-gray-100 text-gray-800',
  LOGIN_FAILED: 'bg-red-100 text-red-800',
};

export const AdminConfigPage = () => {
  const { t } = useTranslation();
  const [entries, setEntries] = useState<LoginLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [actionFilter, setActionFilter] = useState<string>('');
  const [loading, setLoading] = useState(true);

  // AI provider enablement state
  const [providers, setProviders] = useState<AIProviderStatus[]>([]);
  const [savingProviders, setSavingProviders] = useState(false);
  const [providerFeedback, setProviderFeedback] = useState<'saved' | 'error' | null>(null);

  const loadProviders = useCallback(async () => {
    try {
      const response = await adminService.getAIProviderConfig();
      setProviders(response.providers);
    } catch (error) {
      console.error('Failed to load AI providers:', error);
    }
  }, []);

  useEffect(() => {
    loadProviders();
  }, [loadProviders]);

  const toggleProvider = (id: AIProviderId, enabled: boolean) => {
    setProviderFeedback(null);
    setProviders((prev) =>
      prev.map((p) => (p.provider === id ? { ...p, enabled } : p))
    );
  };

  const saveProviders = async () => {
    try {
      setSavingProviders(true);
      setProviderFeedback(null);
      const response = await adminService.updateAIProviderConfig(
        providers.map((p) => ({ provider: p.provider, enabled: p.enabled }))
      );
      setProviders(response.providers);
      setProviderFeedback('saved');
    } catch (error) {
      console.error('Failed to save AI providers:', error);
      setProviderFeedback('error');
    } finally {
      setSavingProviders(false);
    }
  };

  const loadLogs = useCallback(async () => {
    try {
      setLoading(true);
      const response = await adminService.getLoginLogs({
        page,
        page_size: PAGE_SIZE,
        ...(actionFilter ? { action: actionFilter } : {}),
      });
      setEntries(response.entries);
      setTotal(response.total);
    } catch (error) {
      console.error('Failed to load login logs:', error);
    } finally {
      setLoading(false);
    }
  }, [page, actionFilter]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const formatTimestamp = (iso: string): string => {
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[#000E9C]">{t('page.adminConfig.title')}</h1>
      </div>

      {/* AI provider enablement */}
      <div className="card p-4 mb-8">
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-gray-900">{t('page.adminConfig.aiProviders.title')}</h2>
          <p className="text-sm text-gray-500">{t('page.adminConfig.aiProviders.subtitle')}</p>
        </div>

        <ul className="divide-y divide-gray-100">
          {providers.map((p) => (
            <li key={p.provider} className="flex items-center justify-between py-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-900">{p.name}</span>
                {p.always_enabled && (
                  <span className="px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                    {t('page.adminConfig.aiProviders.alwaysOn')}
                  </span>
                )}
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  className="sr-only peer"
                  checked={p.enabled}
                  disabled={p.always_enabled}
                  onChange={(e) => toggleProvider(p.provider, e.target.checked)}
                />
                <div className="w-11 h-6 bg-gray-200 rounded-full peer peer-checked:bg-[#000E9C] peer-disabled:opacity-50 peer-disabled:cursor-not-allowed after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-5"></div>
              </label>
            </li>
          ))}
        </ul>

        <div className="flex items-center gap-3 mt-4">
          <button
            onClick={saveProviders}
            disabled={savingProviders}
            className="px-4 py-2 bg-[#000E9C] text-white text-sm font-medium rounded hover:bg-[#4949FF] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {savingProviders ? t('page.adminConfig.aiProviders.saving') : t('page.adminConfig.aiProviders.save')}
          </button>
          {providerFeedback === 'saved' && (
            <span className="text-sm text-green-600">{t('page.adminConfig.aiProviders.saved')}</span>
          )}
          {providerFeedback === 'error' && (
            <span className="text-sm text-red-600">{t('page.adminConfig.aiProviders.error')}</span>
          )}
        </div>
      </div>

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">{t('page.adminConfig.logs.title')}</h2>
          <p className="text-sm text-gray-500">{t('page.adminConfig.logs.subtitle')}</p>
        </div>
        <select
          value={actionFilter}
          onChange={(e) => { setPage(1); setActionFilter(e.target.value); }}
          className="border border-gray-300 rounded px-3 py-2 text-sm"
        >
          <option value="">{t('page.adminConfig.filter.all')}</option>
          <option value="LOGIN_SUCCESS">{t('page.adminConfig.event.login')}</option>
          <option value="LOGOUT">{t('page.adminConfig.event.logout')}</option>
          <option value="LOGIN_FAILED">{t('page.adminConfig.event.failed')}</option>
        </select>
      </div>

      {loading ? (
        <div className="text-center py-8 text-gray-500">{t('page.adminConfig.loading')}</div>
      ) : entries.length === 0 ? (
        <div className="text-center py-8 text-gray-500">{t('page.adminConfig.empty')}</div>
      ) : (
        <>
          <div className="card overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('page.adminConfig.col.user')}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('page.adminConfig.col.email')}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('page.adminConfig.col.event')}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('page.adminConfig.col.when')}</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{t('page.adminConfig.col.ip')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {entries.map((entry) => (
                  <tr key={entry.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-sm text-gray-900">{entry.user_name || '—'}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{entry.user_email || '—'}</td>
                    <td className="px-4 py-3 text-sm">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${eventBadgeClass[entry.action] || 'bg-gray-100 text-gray-800'}`}>
                        {eventLabelKey[entry.action] ? t(eventLabelKey[entry.action]) : entry.action}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700">{formatTimestamp(entry.timestamp)}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{entry.ip_address || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="px-3 py-1.5 text-sm font-medium border border-gray-300 rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
              >
                {t('page.adminConfig.prev')}
              </button>
              <span className="text-sm text-gray-500">{page} / {totalPages}</span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="px-3 py-1.5 text-sm font-medium border border-gray-300 rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
              >
                {t('page.adminConfig.next')}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

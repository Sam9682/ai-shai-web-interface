import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from '../../hooks/useLanguage';
import { authService } from '../../services/authService';
import {
  prerequisitesService,
  type Installation,
} from '../../services/prerequisitesService';
import { DeleteInstallationDialog } from './DeleteInstallationDialog';

/**
 * Default first prerequisite slug an Installation row links to. Kept as a small
 * named constant so the installation-scoped routing work (task 9.x) can align
 * the entry-point slug in one place. It matches the first non "how-to-use"
 * question-archetype nav item (`network-checklist`).
 */
export const FIRST_PREREQ_SLUG = 'network-checklist';

/** Build the installation-scoped entry route for a given Installation id. */
export const installationRoute = (id: string): string =>
  `/prerequisites/installations/${id}/${FIRST_PREREQ_SLUG}`;

type LoadStatus = 'loading' | 'ready' | 'error';

const PRIMARY_BUTTON =
  'rounded bg-[#000E9C] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#4949FF] disabled:cursor-not-allowed disabled:opacity-60';

const SECONDARY_BUTTON =
  'rounded border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60';

const DANGER_BUTTON =
  'rounded border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60';

const FIELD_CLASS =
  'w-full px-3 py-2 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-[#4949FF] focus:border-transparent';

/**
 * Prerequisites entry point (Req 5.1). Lists every Installation by its
 * Project_Name (Req 5.2); each row links to the installation-scoped
 * prerequisites route (Req 5.3). Create/Edit/Delete controls render only for
 * administrators (Req 5.4) and are hidden for every other role (Req 5.5).
 *
 * The Delete control wires a `pendingDelete` seam: `handleDeleteRequest` opens
 * a confirmation, `confirmDelete` performs the deletion + refresh, and
 * `cancelDelete` closes without touching the service. Task 8.2 drops the
 * `DeleteInstallationDialog` component into that seam; a minimal inline
 * confirmation is rendered here in the meantime.
 */
export const InstallationListPage = () => {
  const { t } = useTranslation();
  const isAdmin = authService.isAdmin();

  const [installations, setInstallations] = useState<Installation[]>([]);
  const [status, setStatus] = useState<LoadStatus>('loading');

  // Create control state.
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Inline edit state (per-row rename).
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  // Delete seam — task 8.2 replaces the inline confirmation with a dialog.
  const [pendingDelete, setPendingDelete] = useState<Installation | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setStatus('loading');
    try {
      const list = await prerequisitesService.listInstallations();
      setInstallations(list);
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    prerequisitesService
      .listInstallations()
      .then((list) => {
        if (cancelled) return;
        setInstallations(list);
        setStatus('ready');
      })
      .catch(() => {
        if (cancelled) return;
        setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleCreate = async () => {
    const name = newName.trim();
    // Reject empty names client-side (Req 3.4 parity on the client).
    if (!name) {
      setActionError(t('prereq.installations.error.emptyName'));
      return;
    }
    setCreating(true);
    setActionError(null);
    try {
      await prerequisitesService.createInstallation(name);
      setNewName('');
      await load();
    } catch {
      setActionError(t('prereq.installations.error.action'));
    } finally {
      setCreating(false);
    }
  };

  const startEdit = (installation: Installation) => {
    setEditingId(installation.id);
    setEditingName(installation.project_name);
    setActionError(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingName('');
  };

  const saveEdit = async (id: string) => {
    const name = editingName.trim();
    if (!name) {
      setActionError(t('prereq.installations.error.emptyName'));
      return;
    }
    setActionError(null);
    try {
      await prerequisitesService.updateInstallation(id, name);
      cancelEdit();
      await load();
    } catch {
      setActionError(t('prereq.installations.error.action'));
    }
  };

  // --- Delete seam (task 8.2 will mount DeleteInstallationDialog here) --------
  const handleDeleteRequest = (installation: Installation) => {
    setActionError(null);
    setPendingDelete(installation);
  };

  const cancelDelete = () => {
    setPendingDelete(null);
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    setActionError(null);
    try {
      await prerequisitesService.deleteInstallation(pendingDelete.id);
      setPendingDelete(null);
      await load();
    } catch {
      setActionError(t('prereq.installations.error.action'));
    } finally {
      setDeleting(false);
    }
  };
  // ---------------------------------------------------------------------------

  return (
    <div className="card p-6">
      <h1 className="text-2xl font-bold text-[#000E9C] mb-5">
        {t('prereq.installations.title')}
      </h1>

      {actionError && (
        <div
          role="alert"
          className="mb-6 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700"
        >
          {actionError}
        </div>
      )}

      {isAdmin && (
        <div className="mb-6 flex flex-wrap items-center gap-2">
          <input
            type="text"
            aria-label={t('prereq.installations.create.label')}
            placeholder={t('prereq.installations.create.placeholder')}
            value={newName}
            disabled={creating}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleCreate();
            }}
            className={`${FIELD_CLASS} max-w-xs`}
          />
          <button
            type="button"
            onClick={() => void handleCreate()}
            disabled={creating}
            className={PRIMARY_BUTTON}
          >
            {creating
              ? t('prereq.installations.create.saving')
              : t('prereq.installations.create.button')}
          </button>
        </div>
      )}

      {status === 'loading' && (
        <div role="status" className="text-sm text-gray-600">
          {t('prereq.installations.loading')}
        </div>
      )}

      {status === 'error' && (
        <div
          role="alert"
          className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800"
        >
          {t('prereq.installations.error.load')}
        </div>
      )}

      {status === 'ready' && installations.length === 0 && (
        <div role="status" className="text-sm text-gray-600">
          {t('prereq.installations.empty')}
        </div>
      )}

      {status === 'ready' && installations.length > 0 && (
        <ul className="divide-y divide-gray-100">
          {installations.map((installation) => {
            const isEditing = editingId === installation.id;
            return (
              <li
                key={installation.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                {isEditing ? (
                  <input
                    type="text"
                    aria-label={t('prereq.installations.edit.label')}
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void saveEdit(installation.id);
                      if (e.key === 'Escape') cancelEdit();
                    }}
                    className={`${FIELD_CLASS} max-w-xs`}
                  />
                ) : (
                  <Link
                    to={installationRoute(installation.id)}
                    className="text-sm font-medium text-[#000E9C] hover:text-[#4949FF] hover:underline"
                  >
                    {installation.project_name}
                  </Link>
                )}

                {isAdmin && (
                  <div className="flex items-center gap-2">
                    {isEditing ? (
                      <>
                        <button
                          type="button"
                          onClick={() => void saveEdit(installation.id)}
                          className={PRIMARY_BUTTON}
                        >
                          {t('prereq.installations.edit.save')}
                        </button>
                        <button
                          type="button"
                          onClick={cancelEdit}
                          className={SECONDARY_BUTTON}
                        >
                          {t('prereq.installations.edit.cancel')}
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => startEdit(installation)}
                          className={SECONDARY_BUTTON}
                        >
                          {t('prereq.installations.edit.button')}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteRequest(installation)}
                          className={DANGER_BUTTON}
                        >
                          {t('prereq.installations.delete.button')}
                        </button>
                      </>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/*
        Delete confirmation dialog (task 8.2). Wired to the same
        pendingDelete / confirmDelete / cancelDelete handlers: confirm runs
        deleteInstallation + refresh (Req 6.2), cancel closes without touching
        the service (Req 6.3). Its message names the target installation (Req 6.1).
      */}
      {isAdmin && (
        <DeleteInstallationDialog
          installation={pendingDelete}
          deleting={deleting}
          onConfirm={() => void confirmDelete()}
          onCancel={cancelDelete}
        />
      )}
    </div>
  );
};

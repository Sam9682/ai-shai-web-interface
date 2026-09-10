import { useEffect, useState } from 'react';
import { securityService, type TwoFactorStatus, type TotpSetup } from '../services/securityService';
import { authService } from '../services/authService';

/** Read the current user's email from the persisted session in localStorage. */
function getCurrentUserEmail(): string {
  try {
    const raw = localStorage.getItem('user');
    if (!raw) return '';
    const parsed = JSON.parse(raw);
    return typeof parsed?.email === 'string' ? parsed.email : '';
  } catch {
    return '';
  }
}

/** Extract a human-readable message from an Axios-style error, falling back to a French default. */
function extractError(err: any, fallback: string): string {
  return (
    err?.response?.data?.detail?.error?.message ||
    err?.response?.data?.detail ||
    err?.response?.data?.message ||
    fallback
  );
}

const inputClass =
  'w-full px-3 py-2.5 border border-gray-300 text-gray-900 rounded focus:outline-none focus:ring-2 focus:ring-[#4949FF] focus:border-transparent transition-all text-sm';
const primaryButtonClass =
  'w-full py-2.5 text-sm font-semibold rounded text-white bg-[#000E9C] hover:bg-[#4949FF] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#4949FF] disabled:opacity-50 transition-colors';
const secondaryButtonClass =
  'w-full py-2.5 text-sm font-semibold rounded text-[#000E9C] bg-white border border-[#000E9C] hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#4949FF] disabled:opacity-50 transition-colors';

function SuccessBanner({ message }: { message: string }) {
  return (
    <div className="rounded bg-green-50 border border-green-200 p-3" role="status">
      <p className="text-sm text-green-800">{message}</p>
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="rounded bg-red-50 border border-red-200 p-3" role="alert">
      <p className="text-sm text-red-800">{message}</p>
    </div>
  );
}

function StatusBadge({ active }: { active: boolean }) {
  return active ? (
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
      ✅ Activé
    </span>
  ) : (
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
      ⚪ Désactivé
    </span>
  );
}

function PasswordSection() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const [resetError, setResetError] = useState('');
  const [resetSuccess, setResetSuccess] = useState('');
  const [resetLoading, setResetLoading] = useState(false);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);
    try {
      await securityService.changePassword(currentPassword, newPassword);
      setSuccess('Mot de passe modifié avec succès.');
      setCurrentPassword('');
      setNewPassword('');
    } catch (err: any) {
      setError(extractError(err, 'Impossible de modifier le mot de passe. Veuillez réessayer.'));
    } finally {
      setLoading(false);
    }
  };

  const handleResetByEmail = async () => {
    setResetError('');
    setResetSuccess('');
    const email = getCurrentUserEmail();
    if (!email) {
      setResetError('Adresse email introuvable. Veuillez vous reconnecter.');
      return;
    }
    setResetLoading(true);
    try {
      await authService.requestPasswordReset(email);
      setResetSuccess('Un email de réinitialisation a été envoyé.');
    } catch (err: any) {
      setResetError(extractError(err, 'Une erreur est survenue. Veuillez réessayer.'));
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <section className="card p-6 sm:p-8">
      <h3 className="text-xl font-bold text-[#000E9C] mb-1">🔑 Mot de Passe</h3>
      <p className="text-sm text-gray-600 mb-5">
        Modifiez votre mot de passe ou recevez un lien de réinitialisation par email.
      </p>

      <form className="space-y-4" onSubmit={handleChangePassword}>
        {error && <ErrorBanner message={error} />}
        {success && <SuccessBanner message={success} />}

        <div>
          <label htmlFor="current-password" className="block text-sm font-medium text-gray-700 mb-1">
            Mot de passe actuel
          </label>
          <input
            id="current-password"
            name="current-password"
            type="password"
            autoComplete="current-password"
            required
            className={inputClass}
            placeholder="••••••••"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
          />
        </div>

        <div>
          <label htmlFor="new-password" className="block text-sm font-medium text-gray-700 mb-1">
            Nouveau mot de passe
          </label>
          <input
            id="new-password"
            name="new-password"
            type="password"
            autoComplete="new-password"
            required
            className={inputClass}
            placeholder="••••••••"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
          <p className="mt-1 text-xs text-gray-500">
            Minimum 8 caractères avec majuscule, minuscule et chiffre
          </p>
        </div>

        <button type="submit" disabled={loading} className={primaryButtonClass}>
          {loading ? 'Modification en cours...' : 'Changer le Mot de Passe'}
        </button>
      </form>

      <div className="mt-6 pt-6 border-t border-gray-200 space-y-3">
        {resetError && <ErrorBanner message={resetError} />}
        {resetSuccess && <SuccessBanner message={resetSuccess} />}
        <p className="text-sm text-gray-600">
          Vous préférez réinitialiser votre mot de passe par email ? Un lien sera envoyé à votre adresse
          enregistrée.
        </p>
        <button
          type="button"
          onClick={handleResetByEmail}
          disabled={resetLoading}
          className={secondaryButtonClass}
        >
          {resetLoading ? 'Envoi en cours...' : '📧 Réinitialiser par Email'}
        </button>
      </div>
    </section>
  );
}

function TwoFactorSection() {
  const [status, setStatus] = useState<TwoFactorStatus | null>(null);
  const [statusError, setStatusError] = useState('');
  const [statusLoading, setStatusLoading] = useState(true);

  // TOTP setup flow state
  const [totpSetup, setTotpSetup] = useState<TotpSetup | null>(null);
  const [totpCode, setTotpCode] = useState('');
  const [totpError, setTotpError] = useState('');
  const [totpSuccess, setTotpSuccess] = useState('');
  const [totpBusy, setTotpBusy] = useState(false);

  // Email 2FA state
  const [emailError, setEmailError] = useState('');
  const [emailSuccess, setEmailSuccess] = useState('');
  const [emailBusy, setEmailBusy] = useState(false);

  const loadStatus = async () => {
    setStatusLoading(true);
    setStatusError('');
    try {
      const result = await securityService.getTwoFactorStatus();
      setStatus(result);
    } catch {
      setStatusError('Impossible de charger le statut 2FA.');
    } finally {
      setStatusLoading(false);
    }
  };

  useEffect(() => {
    loadStatus();
  }, []);

  const handleStartTotpSetup = async () => {
    setTotpError('');
    setTotpSuccess('');
    setTotpBusy(true);
    try {
      const setup = await securityService.startTotpSetup();
      setTotpSetup(setup);
    } catch (err: any) {
      setTotpError(extractError(err, 'Impossible de démarrer la configuration TOTP.'));
    } finally {
      setTotpBusy(false);
    }
  };

  const handleConfirmTotp = async (e: React.FormEvent) => {
    e.preventDefault();
    setTotpError('');
    setTotpSuccess('');
    setTotpBusy(true);
    try {
      await securityService.confirmTotp(totpCode.trim());
      setTotpSuccess('Application authenticator activée avec succès.');
      setTotpSetup(null);
      setTotpCode('');
      await loadStatus();
    } catch (err: any) {
      setTotpError(extractError(err, 'Code invalide. Veuillez réessayer.'));
    } finally {
      setTotpBusy(false);
    }
  };

  const handleDisableTotp = async () => {
    setTotpError('');
    setTotpSuccess('');
    setTotpBusy(true);
    try {
      await securityService.disableTotp();
      setTotpSuccess('Application authenticator désactivée.');
      await loadStatus();
    } catch (err: any) {
      setTotpError(extractError(err, 'Impossible de désactiver le TOTP.'));
    } finally {
      setTotpBusy(false);
    }
  };

  const handleToggleEmail2fa = async () => {
    setEmailError('');
    setEmailSuccess('');
    setEmailBusy(true);
    const enabling = !status?.email_2fa_enabled;
    try {
      if (enabling) {
        await securityService.enableEmail2fa();
        setEmailSuccess('Vérification par email activée.');
      } else {
        await securityService.disableEmail2fa();
        setEmailSuccess('Vérification par email désactivée.');
      }
      await loadStatus();
    } catch (err: any) {
      setEmailError(
        extractError(
          err,
          enabling
            ? 'Impossible d\'activer la vérification par email.'
            : 'Impossible de désactiver la vérification par email.'
        )
      );
    } finally {
      setEmailBusy(false);
    }
  };

  const cancelTotpSetup = () => {
    setTotpSetup(null);
    setTotpCode('');
    setTotpError('');
  };

  return (
    <section className="card p-6 sm:p-8">
      <h3 className="text-xl font-bold text-[#000E9C] mb-1">
        🛡️ Authentification à Deux Facteurs (2FA)
      </h3>
      <p className="text-sm text-gray-600 mb-5">
        Ajoutez une couche de sécurité supplémentaire à votre compte.
      </p>

      {statusError && <ErrorBanner message={statusError} />}
      {statusLoading && <p className="text-sm text-gray-500">Chargement du statut 2FA...</p>}

      {!statusLoading && !statusError && status && (
        <div className="space-y-6">
          {/* TOTP method */}
          <div className="border border-gray-200 rounded-lg p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h4 className="text-base font-semibold text-gray-900">
                  📱 Application Authenticator (TOTP)
                </h4>
                <p className="mt-1 text-sm text-gray-600">
                  Utilisez une application comme Google Authenticator, Authy ou Microsoft
                  Authenticator pour générer des codes temporels.
                </p>
              </div>
              <StatusBadge active={status.totp_enabled} />
            </div>

            <div className="mt-4 space-y-3">
              {totpError && <ErrorBanner message={totpError} />}
              {totpSuccess && <SuccessBanner message={totpSuccess} />}

              {status.totp_enabled ? (
                <button
                  type="button"
                  onClick={handleDisableTotp}
                  disabled={totpBusy}
                  className={secondaryButtonClass}
                >
                  {totpBusy ? 'Traitement...' : 'Désactiver l\'application authenticator'}
                </button>
              ) : totpSetup ? (
                <div className="space-y-4">
                  <div className="rounded bg-blue-50 border border-blue-200 p-4 space-y-3">
                    <p className="text-sm text-gray-700">
                      Ajoutez ce compte à votre application authenticator en scannant le QR code ou
                      en saisissant la clé secrète manuellement.
                    </p>
                    <div>
                      <p className="text-xs font-medium text-gray-500 mb-1">
                        Clé secrète (saisie manuelle)
                      </p>
                      <code className="block w-full break-all rounded bg-white border border-gray-200 px-3 py-2 text-sm font-mono text-gray-900">
                        {totpSetup.secret}
                      </code>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-gray-500 mb-1">URI d'approvisionnement (QR)</p>
                      <code className="block w-full break-all rounded bg-white border border-gray-200 px-3 py-2 text-xs font-mono text-gray-700">
                        {totpSetup.otpauth_uri}
                      </code>
                      <p className="mt-1 text-xs text-gray-500">
                        Copiez cette URI dans un générateur de QR code, ou saisissez la clé secrète
                        ci-dessus directement dans votre application.
                      </p>
                    </div>
                  </div>

                  <form className="space-y-3" onSubmit={handleConfirmTotp}>
                    <div>
                      <label htmlFor="totp-code" className="block text-sm font-medium text-gray-700 mb-1">
                        Code de vérification
                      </label>
                      <input
                        id="totp-code"
                        name="totp-code"
                        type="text"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        required
                        className={inputClass}
                        placeholder="123456"
                        value={totpCode}
                        onChange={(e) => setTotpCode(e.target.value)}
                      />
                    </div>
                    <div className="flex gap-3">
                      <button type="submit" disabled={totpBusy} className={primaryButtonClass}>
                        {totpBusy ? 'Vérification...' : 'Confirmer'}
                      </button>
                      <button
                        type="button"
                        onClick={cancelTotpSetup}
                        disabled={totpBusy}
                        className={secondaryButtonClass}
                      >
                        Annuler
                      </button>
                    </div>
                  </form>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleStartTotpSetup}
                  disabled={totpBusy}
                  className={primaryButtonClass}
                >
                  {totpBusy ? 'Chargement...' : 'Configurer l\'application authenticator'}
                </button>
              )}
            </div>
          </div>

          {/* Email 2FA method */}
          <div className="border border-gray-200 rounded-lg p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h4 className="text-base font-semibold text-gray-900">📧 Vérification par Email</h4>
                <p className="mt-1 text-sm text-gray-600">
                  Recevez un code de vérification par email à chaque connexion.
                </p>
              </div>
              <StatusBadge active={status.email_2fa_enabled} />
            </div>

            <div className="mt-4 space-y-3">
              {emailError && <ErrorBanner message={emailError} />}
              {emailSuccess && <SuccessBanner message={emailSuccess} />}

              <button
                type="button"
                onClick={handleToggleEmail2fa}
                disabled={emailBusy}
                className={status.email_2fa_enabled ? secondaryButtonClass : primaryButtonClass}
              >
                {emailBusy
                  ? 'Traitement...'
                  : status.email_2fa_enabled
                  ? 'Désactiver la vérification par email'
                  : 'Activer la vérification par email'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function SecurityPage() {
  return (
    <div className="max-w-2xl mx-auto py-8 px-4 space-y-6">
      <div>
        <h2 className="text-3xl font-bold text-[#000E9C]">🔐 Sécurité du Compte</h2>
        <p className="mt-1 text-sm text-gray-600">
          Gérez votre mot de passe et vos options d'authentification à deux facteurs.
        </p>
      </div>

      <PasswordSection />
      <TwoFactorSection />
    </div>
  );
}

export { SecurityPage };
export default SecurityPage;

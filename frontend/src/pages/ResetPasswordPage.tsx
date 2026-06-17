import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { authService } from '../services/authService';

export const ResetPasswordPage = () => {
  const [searchParams] = useSearchParams();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const token = searchParams.get('token');

  useEffect(() => {
    if (!token) {
      setError('Lien de réinitialisation invalide');
    }
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!token) {
      setError('Lien de réinitialisation invalide');
      return;
    }

    if (password.length < 8) {
      setError('Le mot de passe doit contenir au moins 8 caractères');
      return;
    }

    if (!/[A-Z]/.test(password)) {
      setError('Le mot de passe doit contenir au moins une majuscule');
      return;
    }

    if (!/[a-z]/.test(password)) {
      setError('Le mot de passe doit contenir au moins une minuscule');
      return;
    }

    if (!/\d/.test(password)) {
      setError('Le mot de passe doit contenir au moins un chiffre');
      return;
    }

    if (password !== confirmPassword) {
      setError('Les mots de passe ne correspondent pas');
      return;
    }

    setLoading(true);
    try {
      await authService.resetPassword(token, password);
      setSuccess(true);
      setTimeout(() => navigate('/login'), 3000);
    } catch (err: any) {
      const errorMessage = err.response?.data?.error?.message 
        || err.response?.data?.detail 
        || 'Échec de la réinitialisation. Le lien a peut-être expiré.';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[70vh] flex items-center justify-center py-12 px-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-6">
          <h2 className="text-3xl font-bold text-[#000E9C]">Nouveau mot de passe</h2>
          <p className="mt-1 text-sm text-gray-600">Créez votre nouveau mot de passe</p>
        </div>
        <div className="card p-8">
          {success ? (
            <div className="text-center">
              <div className="rounded bg-green-50 border border-green-200 p-4">
                <p className="text-sm text-green-800">
                  Votre mot de passe a été réinitialisé avec succès !
                </p>
                <p className="text-sm text-green-700 mt-1">
                  Redirection vers la page de connexion...
                </p>
              </div>
            </div>
          ) : (
            <form className="space-y-5" onSubmit={handleSubmit}>
              {error && (
                <div className="rounded bg-red-50 border border-red-200 p-3">
                  <p className="text-sm text-red-800">{error}</p>
                </div>
              )}
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                  Nouveau mot de passe
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  required
                  className="w-full px-3 py-2.5 border border-gray-300 text-gray-900 rounded focus:outline-none focus:ring-2 focus:ring-[#4949FF] focus:border-transparent transition-all text-sm"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <p className="mt-1 text-xs text-gray-500">
                  Min. 8 caractères, 1 majuscule, 1 minuscule, 1 chiffre
                </p>
              </div>
              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">
                  Confirmer le mot de passe
                </label>
                <input
                  id="confirmPassword"
                  name="confirmPassword"
                  type="password"
                  required
                  className="w-full px-3 py-2.5 border border-gray-300 text-gray-900 rounded focus:outline-none focus:ring-2 focus:ring-[#4949FF] focus:border-transparent transition-all text-sm"
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                />
              </div>

              <button
                type="submit"
                disabled={loading || !token}
                className="w-full py-2.5 text-sm font-semibold rounded text-white bg-[#000E9C] hover:bg-[#4949FF] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#4949FF] disabled:opacity-50 transition-colors"
              >
                {loading ? 'Réinitialisation...' : 'Réinitialiser le mot de passe'}
              </button>

              <div className="text-center">
                <a href="/login" className="text-sm font-medium text-[#4949FF] hover:underline">
                  ← Retour à la connexion
                </a>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authService, isLogin2FAChallenge } from '../services/authService';
import { validateEmail } from '../utils/validation';

export const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  // When set, the primary credentials were validated but a second 2FA step is required.
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!validateEmail(email)) {
      setError('Adresse email invalide');
      return;
    }

    setLoading(true);
    try {
      const result = await authService.login({ email, password });
      if (isLogin2FAChallenge(result)) {
        // Do not navigate: switch to the verification-code step.
        setChallengeToken(result.challenge_token);
        setCode('');
        return;
      }
      navigate('/');
    } catch (err: any) {
      console.error('Login error:', err);
      const errorMessage = err.response?.data?.detail?.message 
        || err.response?.data?.detail 
        || err.response?.data?.error?.message 
        || err.message 
        || 'Échec de la connexion';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!challengeToken) {
      return;
    }

    setLoading(true);
    try {
      await authService.verifyLogin2fa(challengeToken, code.trim());
      navigate('/');
    } catch (err: any) {
      console.error('2FA verification error:', err);
      setError('Code de vérification invalide.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[70vh] flex items-center justify-center py-12 px-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-6">
          <h2 className="text-3xl font-bold text-[#000E9C]">Connexion</h2>
          <p className="mt-1 text-sm text-gray-600">
            {challengeToken ? 'Vérification en deux étapes' : 'Accédez à votre espace membre'}
          </p>
        </div>
        <div className="card p-8">
          {challengeToken ? (
            <form className="space-y-5" onSubmit={handleVerifySubmit}>
              {error && (
                <div className="rounded bg-red-50 border border-red-200 p-3">
                  <p className="text-sm text-red-800">{error}</p>
                </div>
              )}
              <p className="text-sm text-gray-600">
                Saisissez le code de vérification pour terminer la connexion.
              </p>
              <div>
                <label htmlFor="code" className="block text-sm font-medium text-gray-700 mb-1">
                  Code de vérification
                </label>
                <input
                  id="code"
                  name="code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  required
                  className="w-full px-3 py-2.5 border border-gray-300 text-gray-900 rounded focus:outline-none focus:ring-2 focus:ring-[#4949FF] focus:border-transparent transition-all text-sm"
                  placeholder="123456"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 text-sm font-semibold rounded text-white bg-[#000E9C] hover:bg-[#4949FF] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#4949FF] disabled:opacity-50 transition-colors"
              >
                {loading ? 'Vérification en cours...' : 'Vérifier'}
              </button>

              <button
                type="button"
                onClick={() => {
                  setChallengeToken(null);
                  setCode('');
                  setError('');
                }}
                className="w-full text-sm text-[#4949FF] hover:underline"
              >
                Retour
              </button>
            </form>
          ) : (
            <form className="space-y-5" onSubmit={handleSubmit}>
              {error && (
                <div className="rounded bg-red-50 border border-red-200 p-3">
                  <p className="text-sm text-red-800">{error}</p>
                </div>
              )}
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                  Adresse email
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  className="w-full px-3 py-2.5 border border-gray-300 text-gray-900 rounded focus:outline-none focus:ring-2 focus:ring-[#4949FF] focus:border-transparent transition-all text-sm"
                  placeholder="votre@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
                  Mot de passe
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
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 text-sm font-semibold rounded text-white bg-[#000E9C] hover:bg-[#4949FF] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#4949FF] disabled:opacity-50 transition-colors"
              >
                {loading ? 'Connexion en cours...' : 'Se connecter'}
              </button>
            </form>
          )}
          {!challengeToken && (
            <div className="mt-5 space-y-2 text-center">
              <a href="/forgot-password" className="text-sm text-[#4949FF] hover:underline">
                Mot de passe oublié ?
              </a>
              <p className="text-sm text-gray-600">
                Pas encore membre ?{' '}
                <a href="/register" className="font-medium text-[#4949FF] hover:underline">
                  Inscrivez-vous ici
                </a>
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

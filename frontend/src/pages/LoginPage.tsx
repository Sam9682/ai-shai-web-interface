import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authService } from '../services/authService';
import { validateEmail } from '../utils/validation';

export const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
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
      await authService.login({ email, password });
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

  return (
    <div className="min-h-[70vh] flex items-center justify-center py-12 px-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-6">
          <h2 className="text-3xl font-bold text-[#000E9C]">Connexion</h2>
          <p className="mt-1 text-sm text-gray-600">Accédez à votre espace membre</p>
        </div>
        <div className="card p-8">
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
        </div>
      </div>
    </div>
  );
};

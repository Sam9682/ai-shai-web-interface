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
      console.error('Error response:', err.response);
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
    <div className="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <div className="inline-block mb-4">
            <span className="text-6xl">🔐</span>
          </div>
          <h2 className="text-4xl font-extrabold bg-gradient-to-r from-primary-600 to-purple-600 bg-clip-text text-transparent">
            Connexion
          </h2>
          <p className="mt-2 text-gray-600">Accédez à votre espace membre</p>
        </div>
        <div className="bg-white/80 backdrop-blur-sm p-8 rounded-2xl shadow-xl border border-primary-100">
          <form className="space-y-6" onSubmit={handleSubmit}>
            {error && (
              <div className="rounded-lg bg-red-50 border border-red-200 p-4">
                <div className="flex items-center">
                  <span className="text-2xl mr-2">⚠️</span>
                  <p className="text-sm text-red-800">{error}</p>
                </div>
              </div>
            )}
            <div className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm font-semibold text-gray-700 mb-2">
                  <span className="mr-1">📧</span> Adresse email
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  className="appearance-none relative block w-full px-4 py-3 border border-gray-300 placeholder-gray-400 text-gray-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
                  placeholder="votre@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div>
                <label htmlFor="password" className="block text-sm font-semibold text-gray-700 mb-2">
                  <span className="mr-1">🔑</span> Mot de passe
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  required
                  className="appearance-none relative block w-full px-4 py-3 border border-gray-300 placeholder-gray-400 text-gray-900 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent transition-all"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>

            <div>
              <button
                type="submit"
                disabled={loading}
                className="w-full flex justify-center items-center py-3 px-4 text-sm font-semibold rounded-lg text-white bg-gradient-to-r from-primary-600 to-purple-600 hover:from-primary-700 hover:to-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 shadow-lg hover:shadow-xl transition-all duration-300"
              >
                {loading ? (
                  <>
                    <span className="mr-2">⏳</span> Connexion en cours...
                  </>
                ) : (
                  <>
                    <span className="mr-2">🚀</span> Se connecter
                  </>
                )}
              </button>
            </div>
          </form>
          <div className="mt-6 space-y-3">
            <div className="text-center">
              <a href="/forgot-password" className="text-sm font-semibold text-primary-600 hover:text-primary-700 transition-colors">
                🔑 Mot de passe oublié ?
              </a>
            </div>
            <div className="text-center">
              <p className="text-sm text-gray-600">
                Pas encore membre ?{' '}
                <a href="/register" className="font-semibold text-primary-600 hover:text-primary-700 transition-colors">
                  Inscrivez-vous ici ✨
                </a>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

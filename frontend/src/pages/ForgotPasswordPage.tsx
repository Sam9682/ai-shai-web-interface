import { useState } from 'react';
import { authService } from '../services/authService';
import { validateEmail } from '../utils/validation';

export const ForgotPasswordPage = () => {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess(false);

    if (!validateEmail(email)) {
      setError('Adresse email invalide');
      return;
    }

    setLoading(true);
    try {
      await authService.requestPasswordReset(email);
      setSuccess(true);
    } catch (err: any) {
      console.error('Password reset request error:', err);
      setError('Une erreur est survenue. Veuillez réessayer.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <div className="inline-block mb-4">
            <span className="text-6xl">🔑</span>
          </div>
          <h2 className="text-4xl font-extrabold bg-gradient-to-r from-primary-600 to-purple-600 bg-clip-text text-transparent">
            Mot de passe oublié
          </h2>
          <p className="mt-2 text-gray-600">Recevez un lien de réinitialisation par email</p>
        </div>
        <div className="bg-white/80 backdrop-blur-sm p-8 rounded-2xl shadow-xl border border-primary-100">
          {success ? (
            <div className="text-center space-y-4">
              <div className="rounded-lg bg-green-50 border border-green-200 p-4">
                <div className="flex items-center justify-center mb-2">
                  <span className="text-4xl">✅</span>
                </div>
                <p className="text-sm text-green-800">
                  Si cet email existe dans notre système, vous recevrez un lien de réinitialisation dans quelques instants.
                </p>
              </div>
              <a
                href="/login"
                className="inline-flex items-center text-sm font-semibold text-primary-600 hover:text-primary-700 transition-colors"
              >
                ← Retour à la connexion
              </a>
            </div>
          ) : (
            <form className="space-y-6" onSubmit={handleSubmit}>
              {error && (
                <div className="rounded-lg bg-red-50 border border-red-200 p-4">
                  <div className="flex items-center">
                    <span className="text-2xl mr-2">⚠️</span>
                    <p className="text-sm text-red-800">{error}</p>
                  </div>
                </div>
              )}
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
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex justify-center items-center py-3 px-4 text-sm font-semibold rounded-lg text-white bg-gradient-to-r from-primary-600 to-purple-600 hover:from-primary-700 hover:to-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 shadow-lg hover:shadow-xl transition-all duration-300"
                >
                  {loading ? (
                    <>
                      <span className="mr-2">⏳</span> Envoi en cours...
                    </>
                  ) : (
                    <>
                      <span className="mr-2">📧</span> Envoyer le lien
                    </>
                  )}
                </button>
              </div>

              <div className="text-center">
                <a
                  href="/login"
                  className="text-sm font-semibold text-primary-600 hover:text-primary-700 transition-colors"
                >
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

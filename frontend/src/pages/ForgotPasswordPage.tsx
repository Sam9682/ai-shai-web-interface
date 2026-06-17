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
      setError('Une erreur est survenue. Veuillez réessayer.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[70vh] flex items-center justify-center py-12 px-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-6">
          <h2 className="text-3xl font-bold text-[#000E9C]">Mot de passe oublié</h2>
          <p className="mt-1 text-sm text-gray-600">Recevez un lien de réinitialisation par email</p>
        </div>
        <div className="card p-8">
          {success ? (
            <div className="text-center space-y-4">
              <div className="rounded bg-green-50 border border-green-200 p-4">
                <p className="text-sm text-green-800">
                  Si cet email existe dans notre système, vous recevrez un lien de réinitialisation dans quelques instants.
                </p>
              </div>
              <a href="/login" className="text-sm font-medium text-[#4949FF] hover:underline">
                ← Retour à la connexion
              </a>
            </div>
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

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 text-sm font-semibold rounded text-white bg-[#000E9C] hover:bg-[#4949FF] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#4949FF] disabled:opacity-50 transition-colors"
              >
                {loading ? 'Envoi en cours...' : 'Envoyer le lien'}
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

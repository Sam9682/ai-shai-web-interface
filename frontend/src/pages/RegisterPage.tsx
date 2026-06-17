import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authService } from '../services/authService';
import { validateEmail, getPasswordStrengthMessage } from '../utils/validation';

export const RegisterPage = () => {
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: '',
    firstName: '',
    lastName: '',
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!validateEmail(formData.email)) {
      setError('Adresse email invalide');
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setError('Les mots de passe ne correspondent pas');
      return;
    }

    const passwordError = getPasswordStrengthMessage(formData.password);
    if (passwordError) {
      setError(passwordError);
      return;
    }

    setLoading(true);
    try {
      await authService.register({
        email: formData.email,
        password: formData.password,
        firstName: formData.firstName,
        lastName: formData.lastName,
      });
      setSuccess(true);
      setTimeout(() => navigate('/login'), 3000);
    } catch (err: any) {
      const errorMessage = 
        err.response?.data?.detail?.error?.message || 
        err.response?.data?.detail || 
        err.response?.data?.message ||
        'Échec de l\'inscription';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center py-12 px-4">
        <div className="max-w-md w-full">
          <div className="card p-8 text-center">
            <h3 className="text-xl font-bold text-green-800 mb-3">Inscription réussie !</h3>
            <p className="text-sm text-green-700">
              Veuillez vérifier votre email pour activer votre compte.
              Redirection vers la page de connexion...
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[70vh] flex items-center justify-center py-12 px-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-6">
          <h2 className="text-3xl font-bold text-[#000E9C]">Inscription</h2>
          <p className="mt-1 text-sm text-gray-600">Rejoignez notre communauté</p>
        </div>
        <div className="card p-8">
          <form className="space-y-4" onSubmit={handleSubmit}>
            {error && (
              <div className="rounded bg-red-50 border border-red-200 p-3">
                <p className="text-sm text-red-800">{error}</p>
              </div>
            )}
            <div>
              <label htmlFor="firstName" className="block text-sm font-medium text-gray-700 mb-1">
                Prénom
              </label>
              <input
                id="firstName"
                name="firstName"
                type="text"
                required
                className="w-full px-3 py-2.5 border border-gray-300 text-gray-900 rounded focus:outline-none focus:ring-2 focus:ring-[#4949FF] focus:border-transparent transition-all text-sm"
                placeholder="Jean"
                value={formData.firstName}
                onChange={handleChange}
              />
            </div>
            <div>
              <label htmlFor="lastName" className="block text-sm font-medium text-gray-700 mb-1">
                Nom
              </label>
              <input
                id="lastName"
                name="lastName"
                type="text"
                required
                className="w-full px-3 py-2.5 border border-gray-300 text-gray-900 rounded focus:outline-none focus:ring-2 focus:ring-[#4949FF] focus:border-transparent transition-all text-sm"
                placeholder="Dupont"
                value={formData.lastName}
                onChange={handleChange}
              />
            </div>
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
                placeholder="jean.dupont@email.com"
                value={formData.email}
                onChange={handleChange}
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
                value={formData.password}
                onChange={handleChange}
              />
              <p className="mt-1 text-xs text-gray-500">
                Minimum 8 caractères avec majuscule, minuscule et chiffre
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
                value={formData.confirmPassword}
                onChange={handleChange}
              />
              {formData.confirmPassword && formData.password !== formData.confirmPassword && (
                <p className="mt-1 text-xs text-red-600">Les mots de passe ne correspondent pas</p>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 text-sm font-semibold rounded text-white bg-[#000E9C] hover:bg-[#4949FF] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#4949FF] disabled:opacity-50 transition-colors"
            >
              {loading ? 'Inscription en cours...' : 'S\'inscrire'}
            </button>
          </form>
          <div className="mt-5 text-center">
            <p className="text-sm text-gray-600">
              Déjà membre ?{' '}
              <a href="/login" className="font-medium text-[#4949FF] hover:underline">
                Connectez-vous ici
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

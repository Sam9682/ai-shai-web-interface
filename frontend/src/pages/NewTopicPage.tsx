import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { forumService } from '../services/forumService';

export const NewTopicPage = () => {
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    try {
      setSubmitting(true);
      setError(null);
      const topic = await forumService.createTopic({ title });
      navigate(`/forum/topics/${topic.id}`);
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Erreur lors de la création du sujet');
      setSubmitting(false);
    }
  };

  return (
    <div className="px-4 sm:px-6 lg:px-8">
      <div className="mb-4">
        <Link to="/forum" className="text-blue-600 hover:text-blue-800">
          ← Retour au forum
        </Link>
      </div>

      <div className="bg-white shadow sm:rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-6">Nouveau sujet</h1>

          <form onSubmit={handleSubmit}>
            {error && (
              <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="title" className="block text-sm font-medium text-gray-700">
                Titre du sujet
              </label>
              <input
                type="text"
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="mt-1 shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md"
                placeholder="Entrez le titre de votre sujet"
                disabled={submitting}
                required
                maxLength={255}
              />
              <p className="mt-2 text-sm text-gray-500">
                Choisissez un titre clair et descriptif pour votre sujet
              </p>
            </div>

            <div className="mt-6 flex justify-end space-x-3">
              <Link
                to="/forum"
                className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
              >
                Annuler
              </Link>
              <button
                type="submit"
                disabled={submitting || !title.trim()}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? 'Création...' : 'Créer le sujet'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

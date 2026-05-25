import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { forumService, type Topic } from '../services/forumService';

export const ForumPage = () => {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadTopics();
  }, []);

  const loadTopics = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await forumService.getTopics();
      setTopics(data);
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Erreur lors du chargement des sujets');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('fr-FR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="text-center">
          <span className="text-5xl animate-spin inline-block">⏳</span>
          <p className="mt-4 text-gray-600 font-medium">Chargement...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8">
      <div className="sm:flex sm:items-center sm:justify-between mb-8">
        <div>
          <div className="flex items-center mb-2">
            <span className="text-4xl mr-3">💬</span>
            <h1 className="text-4xl font-extrabold bg-gradient-to-r from-primary-600 to-purple-600 bg-clip-text text-transparent">
              Forum
            </h1>
          </div>
          <p className="mt-2 text-gray-600">
            Discutez avec les autres membres de l'association 🤝
          </p>
        </div>
        <div className="mt-4 sm:mt-0">
          <Link
            to="/forum/new"
            className="inline-flex items-center px-6 py-3 text-sm font-semibold rounded-lg text-white bg-gradient-to-r from-primary-600 to-purple-600 hover:from-primary-700 hover:to-purple-700 shadow-lg hover:shadow-xl transition-all duration-300"
          >
            <span className="mr-2">✍️</span> Nouveau sujet
          </Link>
        </div>
      </div>

      {error && (
        <div className="mb-6 bg-red-50 border-l-4 border-red-500 p-4 rounded-lg">
          <div className="flex items-center">
            <span className="text-2xl mr-3">⚠️</span>
            <p className="text-red-700 font-medium">{error}</p>
          </div>
        </div>
      )}

      <div className="bg-white/80 backdrop-blur-sm shadow-xl rounded-2xl overflow-hidden border border-primary-100">
        {topics.length === 0 ? (
          <div className="text-center py-16 px-4">
            <span className="text-6xl mb-4 inline-block">📝</span>
            <p className="text-gray-600 text-lg mb-6">Aucun sujet pour le moment</p>
            <Link
              to="/forum/new"
              className="inline-flex items-center px-6 py-3 text-sm font-semibold rounded-lg text-white bg-gradient-to-r from-primary-600 to-purple-600 hover:from-primary-700 hover:to-purple-700 shadow-lg hover:shadow-xl transition-all duration-300"
            >
              <span className="mr-2">🚀</span> Créer le premier sujet
            </Link>
          </div>
        ) : (
          <ul className="divide-y divide-gray-200">
            {topics.map((topic) => (
              <li key={topic.id}>
                <Link
                  to={`/forum/topics/${topic.id}`}
                  className="block hover:bg-gradient-to-r hover:from-primary-50 hover:to-purple-50 transition-all duration-300"
                >
                  <div className="px-6 py-5">
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-3 mb-2">
                          <span className="text-2xl">💭</span>
                          <h3 className="text-lg font-bold text-primary-700 hover:text-primary-800 truncate">
                            {topic.title}
                          </h3>
                          {topic.is_pinned && (
                            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-gradient-to-r from-yellow-400 to-orange-400 text-white shadow-sm">
                              📌 Épinglé
                            </span>
                          )}
                          {topic.is_locked && (
                            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-gray-200 text-gray-700">
                              🔒 Verrouillé
                            </span>
                          )}
                        </div>
                        <div className="flex items-center text-sm text-gray-600">
                          <span className="mr-1">👤</span>
                          <span className="font-medium">{topic.author_name}</span>
                          <span className="mx-2">•</span>
                          <span className="mr-1">📅</span>
                          <span>{formatDate(topic.created_at)}</span>
                        </div>
                      </div>
                      <div className="ml-6 flex-shrink-0 text-right">
                        <div className="inline-flex items-center px-4 py-2 rounded-lg bg-gradient-to-r from-primary-100 to-purple-100">
                          <span className="mr-2">💬</span>
                          <span className="text-sm font-bold text-primary-700">
                            {topic.post_count}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

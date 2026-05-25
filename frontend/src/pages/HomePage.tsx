import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { forumService, type Topic } from '../services/forumService';
import { authService } from '../services/authService';
import { infoService, type Stats } from '../services/infoService';
import sampng from '../assets/Sam.png';
import ninipng from '../assets/Nini.png';
import hypervisiapng from '/hypervisia.png';

export const HomePage = () => {
  const [topics, setTopics] = useState<Topic[]>([]);
  const [loadingTopics, setLoadingTopics] = useState(true);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loadingStats, setLoadingStats] = useState(true);
  const isAuthenticated = authService.isAuthenticated();

  useEffect(() => {
    loadTopics();
    loadStats();
  }, []);

  const loadTopics = async () => {
    try {
      setLoadingTopics(true);
      // Utiliser l'endpoint public si l'utilisateur n'est pas connecté
      const data = isAuthenticated 
        ? await forumService.getTopics(false)
        : await forumService.getTopicsPublic();
      // Get only the 5 most recent topics
      setTopics(data.slice(0, 5));
    } catch (err) {
      console.error('Error loading topics:', err);
      // En cas d'erreur, on continue sans bloquer
      setTopics([]);
    } finally {
      setLoadingTopics(false);
    }
  };

  const loadStats = async () => {
    try {
      setLoadingStats(true);
      const data = await infoService.getStats();
      setStats(data);
    } catch (err) {
      console.error('Error loading stats:', err);
      // En cas d'erreur, on utilise des valeurs par défaut
      setStats(null);
    } finally {
      setLoadingStats(false);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  return (
    <div className="px-4 py-8">
      {/* Hero Section */}
      <div className="text-center mb-16 relative">
        <div className="absolute inset-0 bg-gradient-to-r from-primary-400/20 to-purple-400/20 blur-3xl -z-10"></div>
        <div className="inline-block mb-4">
          <span className="text-6xl animate-bounce inline-block">🔮</span>
        </div>
        <h1 className="text-5xl md:text-6xl font-extrabold mb-6 bg-gradient-to-r from-primary-600 via-purple-600 to-pink-600 bg-clip-text text-transparent">
          Bienvenue à HYPERVISIA
        </h1>
        <div className="flex justify-center mb-6">
          <img 
            src={hypervisiapng} 
            alt="Différences entre l'Homme et l'IA" 
            className="max-w-2xl w-full h-auto rounded-2xl shadow-2xl border-4 border-primary-200 hover:scale-105 transition-transform duration-300"
          />
        </div>
        <p className="text-xl md:text-2xl text-gray-700 max-w-3xl mx-auto leading-relaxed">
          L'Association a pour objet de promouvoir la compréhension, l'usage, la recherche appliquée et le développement de l'intelligence artificielle, notamment par :
        </p>
        <ul className="text-lg text-gray-600 max-w-3xl mx-auto mt-4 space-y-2 list-disc list-inside">
          <li>la compréhension de l'impact majeur sur l'évolution de la société,</li>
          <li>des actions de sensibilisation et de vulgarisation,</li>
          <li>des événements (conférences, rencontres, hackathons),</li>
          <li>l'accès à des outils, dont la plateforme <a href="https://softfluid.fr" target="_blank" rel="noopener noreferrer" className="bg-yellow-200 text-primary-600 hover:text-primary-700 underline transition-colors px-1 rounded">softfluid.fr</a></li>
        </ul>
        <p className="text-xl text-gray-700 max-w-3xl mx-auto mt-4">✨</p>
        <div className="mt-8 flex justify-center gap-4">
          <a href="/register" className="btn-primary">
            <span className="mr-2">🎯</span>
            Rejoindre l'aventure
          </a>
          <a href="/forum" className="btn-secondary">
            <span className="mr-2">💬</span>
            Découvrir le forum
          </a>
        </div>
      </div>

      {/* Features Grid */}
      <div className="grid md:grid-cols-3 gap-8 mb-16">
        <div className="bg-white/80 backdrop-blur-sm p-8 rounded-2xl shadow-lg card-hover border border-primary-100">
          <div className="text-5xl mb-4">🎯</div>
          <h2 className="text-2xl font-bold text-gray-900 mb-4 bg-gradient-to-r from-pink-600 to-red-600 bg-clip-text text-transparent">
            Notre Mission
          </h2>
          <p className="text-gray-600 leading-relaxed">
            Créer un espace d'échange et de collaboration pour nos membres, 
            pour prendre conscience de l'impact de l'IA sur notre société 🤝
            Ce site web a été spécifié, construit, deployé en moins de 24h pour un coût de €1 😱
          </p>
        </div>
        
        <div className="bg-white/80 backdrop-blur-sm p-8 rounded-2xl shadow-lg card-hover border border-purple-100">
          <div className="text-5xl mb-4">🤖</div>
          <h2 className="text-2xl font-bold text-gray-900 mb-4 bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
            Nos Activités
          </h2>
          <p className="text-gray-600 leading-relaxed">
            Utilisation d'une plateforme de test pour du 
            déploiement d'application web par des agents IA <a href="https://softfluid.fr" target="_blank" rel="noopener noreferrer" className="bg-yellow-200 text-primary-600 hover:text-primary-700 underline transition-colors px-1 rounded">softfluid.fr</a> 🎪
            Suppression des développeurs, testeurs, intégrateurs, SSII ... 😱Ce site est deployé par des IA sur Softfluid.fr
          </p>
        </div>
        
        <div className="bg-white/80 backdrop-blur-sm p-8 rounded-2xl shadow-lg card-hover border border-pink-100">
          <div className="text-5xl mb-4">🌟</div>
          <h2 className="text-2xl font-bold text-gray-900 mb-4 bg-gradient-to-r from-pink-600 to-red-600 bg-clip-text text-transparent">
            Rejoignez-nous
          </h2>
          <p className="text-gray-600 leading-relaxed">
            Devenez membre et participez activement à la vie de l'association. 
            Ensemble, commençons par impulser la transformation de la société 💪
            en commençant par l'Education et la Formation
          </p>
        </div>
      </div>

      {/* Stats Section */}
      <div className="bg-gradient-to-r from-primary-600 to-purple-600 rounded-2xl shadow-2xl p-8 mb-16 text-white">
        <div className="grid md:grid-cols-3 gap-8 text-center">
          <div>
            <div className="text-4xl font-bold mb-2">
              {loadingStats ? '...' : (stats?.total_users || 0)}+
            </div>
            <div className="text-primary-100">Membres actifs 👥</div>
          </div>
          <div>
            <div className="text-4xl font-bold mb-2">
              {loadingStats ? '...' : (stats?.total_events || 0)}+
            </div>
            <div className="text-primary-100">Événements programmés 📅</div>
          </div>
          <div>
            <div className="text-4xl font-bold mb-2">
              {loadingStats ? '...' : (stats?.total_topics || 0)}+
            </div>
            <div className="text-primary-100">Discussions du forum 💬</div>
          </div>
        </div>
      </div>

      {/* Forum Topics Section */}
      <div className="bg-white/80 backdrop-blur-sm p-8 rounded-2xl shadow-lg border border-primary-100 mb-16">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center">
            <span className="text-4xl mr-3">💬</span>
            <h2 className="text-3xl font-bold text-gray-900">Discussions du Forum</h2>
          </div>
          {isAuthenticated ? (
            <Link
              to="/forum"
              className="inline-flex items-center px-4 py-2 text-sm font-semibold rounded-lg text-primary-600 hover:text-primary-700 hover:bg-primary-50 transition-all duration-300"
            >
              Voir tout <span className="ml-2">→</span>
            </Link>
          ) : (
            <Link
              to="/login"
              className="inline-flex items-center px-4 py-2 text-sm font-semibold rounded-lg text-white bg-gradient-to-r from-primary-600 to-purple-600 hover:from-primary-700 hover:to-purple-700 shadow-md hover:shadow-lg transition-all duration-300"
            >
              <span className="mr-2">🔐</span> Se connecter pour participer
            </Link>
          )}
        </div>

        {!isAuthenticated && (
          <div className="mb-4 p-4 bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200 rounded-lg">
            <div className="flex items-start">
              <span className="text-2xl mr-3">ℹ️</span>
              <div>
                <p className="text-sm font-semibold text-gray-800 mb-1">
                  Aperçu des discussions du forum
                </p>
                <p className="text-sm text-gray-600">
                  Connectez-vous pour accéder aux détails des discussions, participer et créer vos propres sujets.
                </p>
              </div>
            </div>
          </div>
        )}

        {loadingTopics ? (
          <div className="flex justify-center items-center py-8">
            <span className="text-3xl animate-spin inline-block">⏳</span>
            <p className="ml-3 text-gray-600">Chargement...</p>
          </div>
        ) : topics.length === 0 ? (
          <div className="text-center py-8">
            <span className="text-5xl mb-3 inline-block">📝</span>
            <p className="text-gray-600 mb-4">Aucun sujet pour le moment</p>
            <Link
              to="/forum/new"
              className="inline-flex items-center px-4 py-2 text-sm font-semibold rounded-lg text-white bg-gradient-to-r from-primary-600 to-purple-600 hover:from-primary-700 hover:to-purple-700 shadow-lg hover:shadow-xl transition-all duration-300"
            >
              <span className="mr-2">✍️</span> Créer le premier sujet
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {topics.map((topic) => {
              // Afficher un lien cliquable pour tous les utilisateurs (connectés ou non)
              return (
                <div
                  key={topic.id}
                  className="block p-4 rounded-lg hover:bg-gradient-to-r hover:from-primary-50 hover:to-purple-50 transition-all duration-300 border border-gray-100 hover:border-primary-200"
                >
                  <div className="flex items-start justify-between">
                    <Link
                      to={`/forum/topics/${topic.id}`}
                      className="flex-1 min-w-0"
                    >
                      <div className="flex items-center space-x-2 mb-1">
                        <span className="text-xl">💭</span>
                        <h3 className="text-base font-semibold text-gray-900 hover:text-primary-700 truncate">
                          {topic.title}
                        </h3>
                        {topic.is_pinned && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-gradient-to-r from-yellow-400 to-orange-400 text-white">
                            📌
                          </span>
                        )}
                        {!isAuthenticated && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-700">
                            👁️ Lecture seule
                          </span>
                        )}
                      </div>
                      <div className="flex items-center text-xs text-gray-500">
                        <span className="mr-1">👤</span>
                        <span>{topic.author_name}</span>
                        <span className="mx-2">•</span>
                        <span className="mr-1">📅</span>
                        <span>{formatDate(topic.created_at)}</span>
                      </div>
                    </Link>
                    <div className="ml-4 flex-shrink-0 flex items-center gap-2">
                      <div className="inline-flex items-center px-3 py-1 rounded-lg bg-gradient-to-r from-primary-100 to-purple-100">
                        <span className="mr-1 text-sm">💬</span>
                        <span className="text-xs font-bold text-primary-700">
                          {topic.post_count}
                        </span>
                      </div>
                      {!isAuthenticated && (
                        <a
                          href={`https://hypervisia.fr/api/forum/topics/${topic.id}/publichtml`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center px-3 py-1 text-xs font-semibold rounded-lg text-white bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 shadow-sm hover:shadow-md transition-all duration-300"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <span className="mr-1">👁️</span> Voir le post
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Contact Section */}
      <div className="bg-white/80 backdrop-blur-sm p-8 rounded-2xl shadow-lg border border-primary-100">
        <div className="flex items-center mb-6">
          <span className="text-4xl mr-3">📧</span>
          <h2 className="text-3xl font-bold text-gray-900">Contactez-nous</h2>
        </div>
        <div className="grid md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div className="flex items-start">
              <span className="text-2xl mr-3">📍</span>
              <div>
                <p className="font-semibold text-gray-900">Adresse</p>
                <p className="text-gray-600">2 square des coquelicots 91370 VERRIERES LE BUISSON</p>
              </div>
            </div>
            <div className="flex items-start">
              <span className="text-2xl mr-3">✉️</span>
              <div>
                <p className="font-semibold text-gray-900">Email</p>
                <a href="mailto:contact@hypervisia.fr" className="text-primary-600 hover:text-primary-700 transition-colors">
                  contact@hypervisia.fr
                </a>
              </div>
            </div>
          </div>
          <div className="bg-gradient-to-br from-primary-50 to-purple-50 p-6 rounded-xl">
            <h3 className="font-semibold text-gray-900 mb-3">💡 Les membres du bureau ?</h3>
            <p className="text-gray-600 text-sm leading-relaxed">
              - Samuel LEPETRE, Président, ancien ingénieur informatique chez AWS, 35 ans d'expérience, Informaticien depuis l'Oric 1, IA depuis 2023 et depuis, tous les jours<br />
              - Nael LEPETRE, Secrétaire, étudiant en master de Math. et Centrale Lyon, 1ière génération de Maths par l'IA<br />
              - Thibaud BRUNEL, Trésorier, 25 ans d'expérience en informatique
            </p>
            <div className="flex items-center mt-4">
              <img src={sampng} alt="Président" className="h-32 w-auto mr-2 object-contain" />
              <img src={ninipng} alt="Secrétaire" className="h-32 w-auto object-contain" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

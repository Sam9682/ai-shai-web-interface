import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { forumService, type Topic } from '../services/forumService';
import { authService } from '../services/authService';
import { infoService, type Stats } from '../services/infoService';
import OPCPpng from '../assets/OPCP.png';

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
      const data = isAuthenticated 
        ? await forumService.getTopics(false)
        : await forumService.getTopicsPublic();
      setTopics(data.slice(0, 5));
    } catch (err) {
      console.error('Error loading topics:', err);
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
    <div>
      {/* Hero Section */}
      <div className="text-center mb-12">
        <h1 className="text-4xl md:text-5xl font-bold text-[#000E9C] mb-4">
          AI Shai Web Interface
        </h1>
        <div className="flex justify-center mb-6">
          <img 
            src={OPCPpng} 
            alt="OPCP - Intelligence Artificielle" 
            className="max-w-xl w-full h-auto rounded-lg shadow-md border border-gray-200"
          />
        </div>
        <p className="text-lg text-gray-700 max-w-3xl mx-auto leading-relaxed mb-4">
          Ce site a pour objet de promouvoir la compréhension, l'usage, la recherche appliquée et le développement de l'intelligence artificielle, notamment par :
        </p>
        <ul className="text-base text-gray-600 max-w-3xl mx-auto space-y-1 list-disc list-inside text-left">
          <li>la compréhension de l'impact majeur sur l'évolution de la société,</li>
          <li>des actions de sensibilisation et de vulgarisation,</li>
          <li>des événements (conférences, rencontres, hackathons),</li>
          <li>l'accès à des outils, dont la plateforme <a href="https://opcp-psmc.com" target="_blank" rel="noopener noreferrer" className="text-[#4949FF] hover:underline font-medium">opcp-psmc.com</a></li>
        </ul>
        <div className="mt-8 flex justify-center gap-4 flex-wrap">
          <a href="/register" className="btn-primary">
            Rejoindre l'aventure
          </a>
          <a href="/forum" className="btn-secondary">
            Découvrir le forum
          </a>
        </div>
      </div>

      {/* Features Grid */}
      <div className="grid md:grid-cols-3 gap-6 mb-12">
        <div className="card p-6">
          <h2 className="text-xl font-bold text-[#000E9C] mb-3">Notre Mission</h2>
          <p className="text-gray-600 text-sm leading-relaxed">
            Créer un espace d'échange et de collaboration pour nos membres, 
            pour prendre conscience de l'impact de l'IA sur notre société.
            Ce site web a été spécifié, construit et déployé en moins de 24h pour un coût de 1€.
          </p>
        </div>
        
        <div className="card p-6">
          <h2 className="text-xl font-bold text-[#000E9C] mb-3">Nos Activités</h2>
          <p className="text-gray-600 text-sm leading-relaxed">
            Utilisation d'une plateforme de test pour du 
            déploiement d'application web par des agents IA sur <a href="https://opcp-psmc.com" target="_blank" rel="noopener noreferrer" className="text-[#4949FF] hover:underline font-medium">opcp-psmc.com</a>.
            Ce site est déployé par des IA sur la plateforme.
          </p>
        </div>
        
        <div className="card p-6">
          <h2 className="text-xl font-bold text-[#000E9C] mb-3">Rejoignez-nous</h2>
          <p className="text-gray-600 text-sm leading-relaxed">
            Devenez membre et participez activement à la vie de l'association. 
            Ensemble, impulsons la transformation de la société
            en commençant par l'Éducation et la Formation.
          </p>
        </div>
      </div>

      {/* Stats Section */}
      <div className="bg-[#000E9C] rounded-lg p-8 mb-12 text-white">
        <div className="grid md:grid-cols-3 gap-8 text-center">
          <div>
            <div className="text-3xl font-bold mb-1">
              {loadingStats ? '...' : (stats?.total_users || 0)}+
            </div>
            <div className="text-sm text-blue-200">Membres actifs</div>
          </div>
          <div>
            <div className="text-3xl font-bold mb-1">
              {loadingStats ? '...' : (stats?.total_events || 0)}+
            </div>
            <div className="text-sm text-blue-200">Événements programmés</div>
          </div>
          <div>
            <div className="text-3xl font-bold mb-1">
              {loadingStats ? '...' : (stats?.total_topics || 0)}+
            </div>
            <div className="text-sm text-blue-200">Discussions du forum</div>
          </div>
        </div>
      </div>

      {/* Forum Topics Section */}
      <div className="card p-6 mb-12">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-[#000E9C]">Discussions récentes</h2>
          {isAuthenticated ? (
            <Link to="/forum" className="text-sm font-medium text-[#4949FF] hover:underline">
              Voir tout →
            </Link>
          ) : (
            <Link to="/login" className="btn-primary text-sm py-1.5 px-4">
              Se connecter pour participer
            </Link>
          )}
        </div>

        {!isAuthenticated && (
          <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded text-sm text-gray-700">
            <p className="font-medium mb-0.5">Aperçu des discussions du forum</p>
            <p className="text-gray-600">Connectez-vous pour accéder aux détails, participer et créer vos propres sujets.</p>
          </div>
        )}

        {loadingTopics ? (
          <div className="text-center py-8 text-gray-500">Chargement...</div>
        ) : topics.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-gray-600 mb-4">Aucun sujet pour le moment</p>
            <Link to="/forum/new" className="btn-primary text-sm">
              Créer le premier sujet
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {topics.map((topic) => (
              <div key={topic.id} className="py-3 hover:bg-gray-50 transition-colors rounded px-2">
                <div className="flex items-center justify-between">
                  <Link to={`/forum/topics/${topic.id}`} className="flex-1 min-w-0 hover:no-underline">
                    <div className="flex items-center gap-2 mb-0.5">
                      <h3 className="text-sm font-semibold text-gray-900 truncate">
                        {topic.title}
                      </h3>
                      {topic.is_pinned && (
                        <span className="text-xs font-medium px-1.5 py-0.5 bg-yellow-100 text-yellow-800 rounded">
                          Épinglé
                        </span>
                      )}
                      {!isAuthenticated && (
                        <span className="text-xs font-medium px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded">
                          Lecture seule
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500">
                      {topic.author_name} · {formatDate(topic.created_at)}
                    </div>
                  </Link>
                  <div className="ml-4 flex items-center gap-2">
                    <span className="text-xs font-medium text-[#000E9C] bg-blue-50 px-2 py-1 rounded">
                      {topic.post_count} réponses
                    </span>
                    {!isAuthenticated && (
                      <a
                        href={`https://opcp-psmc.com/api/forum/topics/${topic.id}/publichtml`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-medium text-white bg-[#27ae60] hover:bg-[#219a52] px-2 py-1 rounded transition-colors hover:no-underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        Voir
                      </a>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Contact Section */}
      <div className="card p-6">
        <h2 className="text-2xl font-bold text-[#000E9C] mb-6">Contactez-nous</h2>
        <div className="grid md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div>
              <p className="font-medium text-gray-900 text-sm">Adresse</p>
              <p className="text-gray-600 text-sm">OVH Paris</p>
            </div>
            <div>
              <p className="font-medium text-gray-900 text-sm">Email</p>
              <a href="mailto:contact@opcp-psmc.com" className="text-[#4949FF] text-sm hover:underline">
                contact@opcp-psmc.com
              </a>
            </div>
          </div>
          <div className="bg-gray-50 p-5 rounded-lg">
            <h3 className="font-semibold text-gray-900 mb-2 text-sm">La Team PSMC OVH</h3>
            <p className="text-gray-600 text-sm">
              Samuel LEPETRE, Cloud Architect OPCP PSMC
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

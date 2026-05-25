import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { forumService, type TopicDetail, type Post } from '../services/forumService';
import { authService } from '../services/authService';
import { RichTextEditor } from '../components/RichTextEditor';

export const TopicDetailPage = () => {
  const { topicId } = useParams<{ topicId: string }>();
  const [topic, setTopic] = useState<TopicDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [editingPostId, setEditingPostId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);
  const isAuthenticated = authService.isAuthenticated();

  useEffect(() => {
    // Get current user ID and role from localStorage
    const userStr = localStorage.getItem('user');
    if (userStr) {
      try {
        const user = JSON.parse(userStr);
        setCurrentUserId(user.id);
        setCurrentUserRole(user.role);
      } catch (e) {
        console.error('Error parsing user:', e);
      }
    }

    if (topicId) {
      loadTopic();
    }
  }, [topicId]);

  const loadTopic = async () => {
    if (!topicId) return;

    try {
      setLoading(true);
      setError(null);
      // Utiliser l'endpoint public si l'utilisateur n'est pas connecté
      const data = isAuthenticated 
        ? await forumService.getTopic(topicId)
        : await forumService.getTopicPublic(topicId);
      setTopic(data);
    } catch (err: any) {
      setError(err.response?.data?.error?.message || 'Erreur lors du chargement du sujet');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!topicId || !replyContent.trim()) return;

    try {
      setSubmitting(true);
      setSubmitError(null);
      await forumService.createPost(topicId, { content: replyContent });
      setReplyContent('');
      await loadTopic();
    } catch (err: any) {
      setSubmitError(err.response?.data?.error?.message || 'Erreur lors de l\'envoi de la réponse');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditPost = (post: Post) => {
    setEditingPostId(post.id);
    setEditContent(post.content);
  };

  const handleCancelEdit = () => {
    setEditingPostId(null);
    setEditContent('');
  };

  const handleSaveEdit = async (postId: string) => {
    if (!editContent.trim()) return;

    try {
      await forumService.updatePost(postId, { content: editContent });
      setEditingPostId(null);
      setEditContent('');
      await loadTopic();
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Erreur lors de la modification');
    }
  };

  const handleDeletePost = async (postId: string) => {
    if (!window.confirm('Êtes-vous sûr de vouloir supprimer ce message ? Cette action est irréversible.')) {
      return;
    }

    try {
      await forumService.deletePost(postId);
      await loadTopic();
    } catch (err: any) {
      alert(err.response?.data?.error?.message || 'Erreur lors de la suppression');
    }
  };

  const canEditPost = (post: Post) => {
    return currentUserId === post.author_id || currentUserRole === 'administrator';
  };

  const canDeletePost = () => {
    return currentUserRole === 'administrator';
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

  if (error || !topic) {
    return (
      <div className="px-4 sm:px-6 lg:px-8">
        <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-lg mb-4">
          <div className="flex items-center">
            <span className="text-2xl mr-3">⚠️</span>
            <p className="text-red-700 font-medium">{error || 'Sujet introuvable'}</p>
          </div>
        </div>
        <Link to="/forum" className="inline-flex items-center text-primary-600 hover:text-primary-700 font-medium">
          <span className="mr-2">←</span> Retour au forum
        </Link>
      </div>
    );
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8">
      <div className="mb-6">
        <Link to="/forum" className="inline-flex items-center text-primary-600 hover:text-primary-700 font-medium transition-colors">
          <span className="mr-2">←</span> Retour au forum
        </Link>
      </div>

      {/* Topic Header */}
      <div className="bg-white/80 backdrop-blur-sm shadow-xl rounded-2xl overflow-hidden border border-primary-100 mb-6">
        <div className="px-6 py-6">
          <div className="flex items-center space-x-3 mb-4">
            <span className="text-4xl">💭</span>
            <h1 className="text-3xl font-extrabold text-gray-900">{topic.title}</h1>
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
            <span className="mr-2">👤</span>
            <span className="font-medium">{topic.author_name}</span>
            <span className="mx-3">•</span>
            <span className="mr-2">📅</span>
            <span>{formatDate(topic.created_at)}</span>
          </div>
        </div>
      </div>

      {/* Posts */}
      <div className="space-y-4 mb-6">
        {topic.posts.map((post) => (
          <div key={post.id} className="bg-white/80 backdrop-blur-sm shadow-lg rounded-2xl overflow-hidden border border-gray-100">
            <div className="px-6 py-5">
              <div className="flex items-start space-x-4">
                <div className="flex-shrink-0">
                  <div className="h-12 w-12 rounded-full bg-gradient-to-r from-primary-600 to-purple-600 flex items-center justify-center text-white font-bold text-lg shadow-lg">
                    {post.author_name.charAt(0).toUpperCase()}
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="text-sm font-bold text-gray-900">{post.author_name}</p>
                      <p className="text-xs text-gray-500">{formatDate(post.created_at)}</p>
                      {post.updated_at !== post.created_at && (
                        <p className="text-xs text-gray-400 italic">Modifié le {formatDate(post.updated_at)}</p>
                      )}
                    </div>
                    {isAuthenticated && editingPostId !== post.id && (
                      <div className="flex gap-2">
                        {canEditPost(post) && (
                          <button
                            onClick={() => handleEditPost(post)}
                            className="text-sm text-primary-600 hover:text-primary-700 font-medium transition-colors"
                          >
                            ✏️ Modifier
                          </button>
                        )}
                        {canDeletePost() && (
                          <button
                            onClick={() => handleDeletePost(post.id)}
                            className="text-sm text-red-600 hover:text-red-700 font-medium transition-colors"
                          >
                            🗑️ Supprimer
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                  
                  {editingPostId === post.id ? (
                    <div className="space-y-3">
                      <RichTextEditor
                        value={editContent}
                        onChange={setEditContent}
                        placeholder="Modifiez votre message..."
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleSaveEdit(post.id)}
                          className="px-4 py-2 text-sm font-semibold rounded-lg text-white bg-gradient-to-r from-primary-600 to-purple-600 hover:from-primary-700 hover:to-purple-700 shadow-lg hover:shadow-xl transition-all duration-300"
                        >
                          💾 Enregistrer
                        </button>
                        <button
                          onClick={handleCancelEdit}
                          className="px-4 py-2 text-sm font-semibold rounded-lg text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors"
                        >
                          ❌ Annuler
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div 
                      className="mt-2 text-gray-700 prose prose-sm max-w-none"
                      dangerouslySetInnerHTML={{ __html: post.content }}
                    />
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Reply Form */}
      {!topic.is_locked && (
        <div className="bg-white/80 backdrop-blur-sm shadow-xl rounded-2xl overflow-hidden border border-primary-100">
          <div className="px-6 py-6">
            <div className="flex items-center mb-4">
              <span className="text-2xl mr-3">✍️</span>
              <h3 className="text-xl font-bold text-gray-900">Répondre</h3>
            </div>
            <form onSubmit={handleSubmitReply}>
              {submitError && (
                <div className="mb-4 bg-red-50 border-l-4 border-red-500 p-4 rounded-lg">
                  <div className="flex items-center">
                    <span className="text-2xl mr-3">⚠️</span>
                    <p className="text-red-700 font-medium">{submitError}</p>
                  </div>
                </div>
              )}
              <RichTextEditor
                value={replyContent}
                onChange={setReplyContent}
                placeholder="Écrivez votre réponse... Utilisez la barre d'outils pour formater votre texte, ajouter des emojis ou des images 🎨"
                disabled={submitting}
              />
              <div className="mt-4 flex justify-end">
                <button
                  type="submit"
                  disabled={submitting || !replyContent.trim()}
                  className="inline-flex items-center px-6 py-3 text-sm font-semibold rounded-lg text-white bg-gradient-to-r from-primary-600 to-purple-600 hover:from-primary-700 hover:to-purple-700 shadow-lg hover:shadow-xl transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitting ? (
                    <>
                      <span className="mr-2 animate-spin">⏳</span> Envoi...
                    </>
                  ) : (
                    <>
                      <span className="mr-2">🚀</span> Envoyer
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {topic.is_locked && (
        <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded-lg">
          <div className="flex items-center">
            <span className="text-2xl mr-3">🔒</span>
            <p className="text-yellow-800 font-medium">Ce sujet est verrouillé. Vous ne pouvez plus y répondre.</p>
          </div>
        </div>
      )}
    </div>
  );
};

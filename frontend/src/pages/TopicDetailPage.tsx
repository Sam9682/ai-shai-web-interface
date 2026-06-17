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
    if (!window.confirm('Êtes-vous sûr de vouloir supprimer ce message ?')) return;
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
    return <div className="text-center py-12 text-gray-500">Chargement...</div>;
  }

  if (error || !topic) {
    return (
      <div>
        <div className="mb-4 bg-red-50 border-l-4 border-red-500 p-3 rounded">
          <p className="text-sm text-red-700">{error || 'Sujet introuvable'}</p>
        </div>
        <Link to="/forum" className="text-sm font-medium text-[#4949FF] hover:underline">
          ← Retour au forum
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-5">
        <Link to="/forum" className="text-sm font-medium text-[#4949FF] hover:underline">
          ← Retour au forum
        </Link>
      </div>

      {/* Topic Header */}
      <div className="card p-5 mb-5">
        <div className="flex items-center gap-2 mb-2">
          <h1 className="text-2xl font-bold text-gray-900">{topic.title}</h1>
          {topic.is_pinned && (
            <span className="text-xs font-medium px-1.5 py-0.5 bg-yellow-100 text-yellow-800 rounded">Épinglé</span>
          )}
          {topic.is_locked && (
            <span className="text-xs font-medium px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded">Verrouillé</span>
          )}
        </div>
        <div className="text-xs text-gray-500">
          {topic.author_name} · {formatDate(topic.created_at)}
        </div>
      </div>

      {/* Posts */}
      <div className="space-y-3 mb-5">
        {topic.posts.map((post) => (
          <div key={post.id} className="card p-5">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 h-9 w-9 rounded-full bg-[#000E9C] flex items-center justify-center text-white font-semibold text-sm">
                {post.author_name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">{post.author_name}</p>
                    <p className="text-xs text-gray-500">{formatDate(post.created_at)}</p>
                    {post.updated_at !== post.created_at && (
                      <p className="text-xs text-gray-400 italic">Modifié le {formatDate(post.updated_at)}</p>
                    )}
                  </div>
                  {isAuthenticated && editingPostId !== post.id && (
                    <div className="flex gap-3">
                      {canEditPost(post) && (
                        <button onClick={() => handleEditPost(post)} className="text-xs text-[#4949FF] hover:underline font-medium">
                          Modifier
                        </button>
                      )}
                      {canDeletePost() && (
                        <button onClick={() => handleDeletePost(post.id)} className="text-xs text-red-600 hover:underline font-medium">
                          Supprimer
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
                        className="px-3 py-1.5 text-xs font-medium rounded text-white bg-[#000E9C] hover:bg-[#4949FF] transition-colors"
                      >
                        Enregistrer
                      </button>
                      <button
                        onClick={handleCancelEdit}
                        className="px-3 py-1.5 text-xs font-medium rounded text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors"
                      >
                        Annuler
                      </button>
                    </div>
                  </div>
                ) : (
                  <div 
                    className="text-sm text-gray-700 prose prose-sm max-w-none"
                    dangerouslySetInnerHTML={{ __html: post.content }}
                  />
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Reply Form */}
      {!topic.is_locked && (
        <div className="card p-5">
          <h3 className="text-base font-semibold text-gray-900 mb-3">Répondre</h3>
          <form onSubmit={handleSubmitReply}>
            {submitError && (
              <div className="mb-3 bg-red-50 border-l-4 border-red-500 p-3 rounded">
                <p className="text-sm text-red-700">{submitError}</p>
              </div>
            )}
            <RichTextEditor
              value={replyContent}
              onChange={setReplyContent}
              placeholder="Écrivez votre réponse..."
              disabled={submitting}
            />
            <div className="mt-3 flex justify-end">
              <button
                type="submit"
                disabled={submitting || !replyContent.trim()}
                className="px-5 py-2 text-sm font-medium rounded text-white bg-[#000E9C] hover:bg-[#4949FF] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {submitting ? 'Envoi...' : 'Envoyer'}
              </button>
            </div>
          </form>
        </div>
      )}

      {topic.is_locked && (
        <div className="bg-yellow-50 border-l-4 border-yellow-400 p-3 rounded">
          <p className="text-sm text-yellow-800">Ce sujet est verrouillé. Vous ne pouvez plus y répondre.</p>
        </div>
      )}
    </div>
  );
};

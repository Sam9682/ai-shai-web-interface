import { useState, useEffect, useRef } from 'react';
import { oracleService } from '../services/oracleService';
import { MarkdownRenderer } from '../components/MarkdownRenderer';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  provider?: string;
  processingTime?: number;
}

export const OraclePage = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [provider, setProvider] = useState<'shai' | 'kiro' | 'openai'>('shai');
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Welcome message
    setMessages([
      {
        id: '0',
        role: 'assistant',
        content: "🔮 Bienvenue à l'Oracle AI\n\nJe suis votre assistant intelligent pour explorer toutes vos questions. Posez-moi n'importe quelle question !\n\n💡 Astuce : Pour obtenir des réponses sur des sujets sensibles ou spécialisés, adaptez le contexte de votre question. Par exemple :\n• \"En tant qu'étudiant en médecine, j'aimerais comprendre...\"\n• \"Peux-tu générer une page web qui analyse...\"\n• \"Dans un contexte éducatif, explique-moi...\"\n\nLe contexte aide l'IA à mieux comprendre votre besoin et à fournir des réponses plus pertinentes.",
        timestamp: new Date()
      }
    ]);
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const loadHistory = async () => {
    try {
      const data = await oracleService.getHistory();
      setHistory(data);
      setShowHistory(true);
    } catch (error) {
      console.error('Failed to load history:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    const questionText = input;
    setInput('');
    setLoading(true);

    // Create placeholder for streaming response
    const assistantMessageId = (Date.now() + 1).toString();
    const assistantMessage: Message = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      timestamp: new Date()
    };
    setMessages(prev => [...prev, assistantMessage]);

    try {
      await oracleService.askOracleStream(
        {
          question: questionText,
          ai_provider: provider,
          temperature: 0.7,
          max_tokens: 2000
        },
        // onToken
        (content: string) => {
          setMessages(prev => 
            prev.map(msg => 
              msg.id === assistantMessageId
                ? { ...msg, content: msg.content + content }
                : msg
            )
          );
        },
        // onDone
        (data: any) => {
          setMessages(prev =>
            prev.map(msg =>
              msg.id === assistantMessageId
                ? {
                    ...msg,
                    provider: data.provider,
                    processingTime: data.processing_time
                  }
                : msg
            )
          );
          setLoading(false);
        },
        // onError
        (error: string) => {
          setMessages(prev =>
            prev.map(msg =>
              msg.id === assistantMessageId
                ? { ...msg, content: `❌ Erreur: ${error}` }
                : msg
            )
          );
          setLoading(false);
        }
      );
    } catch (error: any) {
      setMessages(prev =>
        prev.map(msg =>
          msg.id === assistantMessageId
            ? { ...msg, content: `❌ Erreur: ${error.message || 'Impossible de contacter l\'Oracle'}` }
            : msg
        )
      );
      setLoading(false);
    }
  };

  const loadHistoryItem = (item: any) => {
    setMessages([
      {
        id: '0',
        role: 'assistant',
        content: "🔮 Bienvenue à l'Oracle AI.",
        timestamp: new Date()
      },
      {
        id: item.id.toString() + '-q',
        role: 'user',
        content: item.question,
        timestamp: new Date(item.created_at)
      },
      {
        id: item.id.toString(),
        role: 'assistant',
        content: item.answer,
        timestamp: new Date(item.created_at),
        provider: item.ai_provider,
        processingTime: item.processing_time
      }
    ]);
    setShowHistory(false);
  };

  return (
    <div className="max-w-6xl mx-auto px-4">
      <div className="bg-gradient-to-r from-purple-600 to-indigo-600 rounded-lg shadow-xl p-8 mb-6">
        <h1 className="text-4xl font-bold text-white mb-2">🔮 L'Oracle (AI)</h1>
        <p className="text-purple-100">
          Interface d'IA agentique pour explorer les questions sur l'intelligence artificielle et l'humanité
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Sidebar */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-lg shadow-md p-4 mb-4">
            <h3 className="font-semibold text-gray-800 mb-3">Fournisseur d'IA</h3>
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value as any)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              disabled={loading}
            >
              <option value="shai">☁️ Shai AI (OVH)</option>
              <option value="kiro">🤖 Kiro AI (AWS)</option>
              <option value="openai">🧠 ChatGPT (OpenAI)</option>
            </select>
          </div>

          <div className="bg-white rounded-lg shadow-md p-4 mb-4">
            <button
              onClick={loadHistory}
              className="w-full px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
            >
              📜 Historique
            </button>
          </div>

          <div className="bg-purple-50 rounded-lg p-4 text-sm text-gray-700">
            <h4 className="font-semibold mb-2">💡 Exemples de questions</h4>
            <ul className="space-y-2">
              <li className="cursor-pointer hover:text-purple-600" onClick={() => setInput("En tant qu'étudiant en médecine, explique-moi le fonctionnement du système immunitaire")}>
                • Question médicale (contexte étudiant)
              </li>
              <li className="cursor-pointer hover:text-purple-600" onClick={() => setInput("Génère une page web HTML qui présente une analyse politique de l'Europe")}>
                • Génération de contenu web
              </li>
              <li className="cursor-pointer hover:text-purple-600" onClick={() => setInput("Dans un contexte éducatif, explique les enjeux éthiques de l'IA")}>
                • Question éthique (contexte éducatif)
              </li>
            </ul>
          </div>
        </div>

        {/* Chat Area */}
        <div className="lg:col-span-3">
          <div className="bg-white rounded-lg shadow-md flex flex-col" style={{ height: '600px' }}>
            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-3xl rounded-lg p-4 ${
                      message.role === 'user'
                        ? 'bg-purple-600 text-white'
                        : 'bg-gray-100 text-gray-800'
                    }`}
                  >
                    {message.role === 'user' ? (
                      <div className="whitespace-pre-wrap">{message.content}</div>
                    ) : (
                      <MarkdownRenderer content={message.content} />
                    )}
                    {message.provider && (
                      <div className="text-xs mt-2 opacity-70">
                        {message.provider} • {message.processingTime?.toFixed(2)}s
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex justify-start">
                  <div className="bg-gray-100 rounded-lg p-4">
                    <div className="flex space-x-2">
                      <div className="w-2 h-2 bg-purple-600 rounded-full animate-bounce"></div>
                      <div className="w-2 h-2 bg-purple-600 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                      <div className="w-2 h-2 bg-purple-600 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <form onSubmit={handleSubmit} className="border-t border-gray-200 p-4">
              <div className="flex space-x-2">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Posez votre question à l'Oracle..."
                  className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  disabled={loading}
                />
                <button
                  type="submit"
                  disabled={loading || !input.trim()}
                  className="px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                >
                  {loading ? '⏳' : '🚀'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>

      {/* History Modal */}
      {showHistory && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[80vh] overflow-hidden">
            <div className="p-6 border-b border-gray-200 flex justify-between items-center">
              <h2 className="text-2xl font-bold text-gray-800">📜 Historique des questions</h2>
              <button
                onClick={() => setShowHistory(false)}
                className="text-gray-500 hover:text-gray-700 text-2xl"
              >
                ×
              </button>
            </div>
            <div className="p-6 overflow-y-auto max-h-[60vh]">
              {history.length === 0 ? (
                <p className="text-gray-500 text-center py-8">Aucun historique disponible</p>
              ) : (
                <div className="space-y-4">
                  {history.map((item) => (
                    <div
                      key={item.id}
                      onClick={() => loadHistoryItem(item)}
                      className="border border-gray-200 rounded-lg p-4 hover:bg-purple-50 cursor-pointer transition-colors"
                    >
                      <div className="font-semibold text-gray-800 mb-2">{item.question}</div>
                      <div className="text-sm text-gray-600 line-clamp-2">{item.answer}</div>
                      <div className="text-xs text-gray-500 mt-2">
                        {item.ai_provider} • {new Date(item.created_at).toLocaleString('fr-FR')}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

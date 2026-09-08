import { useEffect, useMemo, useState } from 'react';
import { documentService, type Document, type DocumentCategory } from '../services/documentService';

const CATEGORY_LABELS: Record<DocumentCategory, string> = {
  statutes: 'Statuts',
  minutes: 'Comptes rendus',
  financial_reports: 'Rapports financiers',
  other: 'Autre',
};
const CATEGORY_ORDER: DocumentCategory[] = ['statutes', 'minutes', 'financial_reports', 'other'];

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  const units = ['Ko', 'Mo', 'Go'];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

export const DocumentsPage = () => {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    let active = true;
    documentService
      .listDocuments()
      .then((res) => { if (active) setDocuments(res.documents); })
      .catch(() => { if (active) setError('Impossible de charger les documents'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return documents;                                   // Requirement 9.2
    return documents.filter((d) => d.original_name.toLowerCase().includes(q)); // Requirement 9.1
  }, [documents, search]);

  const grouped = useMemo(() => {
    const map: Record<DocumentCategory, Document[]> = {
      statutes: [], minutes: [], financial_reports: [], other: [],
    };
    for (const doc of filtered) map[doc.category].push(doc);   // Requirement 8.1 partition
    return map;
  }, [filtered]);

  const handleDownload = async (doc: Document) => {
    try {
      setDownloadError(null);
      await documentService.downloadDocument(doc.id, doc.original_name); // Requirement 10.1
    } catch {
      setDownloadError(`Échec du téléchargement de « ${doc.original_name} »`); // Requirement 10.3
    }
  };

  if (loading) return <div className="card p-6 text-gray-600">Chargement des documents…</div>;
  if (error) return (
    <div className="card p-6 bg-red-50 border border-red-200 text-red-700">{error}</div>
  );

  return (
    <div>
      <h1 className="text-2xl font-bold text-[#000E9C] mb-5">Documents</h1>

      <div className="mb-5">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher un document…"
          aria-label="Rechercher un document"
          className="w-full px-3 py-2.5 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-[#4949FF] focus:border-transparent"
        />
      </div>

      {downloadError && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm">
          {downloadError}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="card p-6 text-gray-600">Aucun document disponible.</div>
      ) : (
        CATEGORY_ORDER.map((category) =>
          grouped[category].length > 0 ? (
            <section key={category} className="card p-6 mb-5">
              <h2 className="text-lg font-semibold text-[#000E9C] mb-3">{CATEGORY_LABELS[category]}</h2>
              <ul className="divide-y divide-gray-100">
                {grouped[category].map((doc) => (
                  <li key={doc.id} className="flex items-center justify-between py-2.5">
                    <div>
                      <p className="text-sm font-medium text-gray-800">{doc.original_name}</p>
                      <p className="text-xs text-gray-500">{formatSize(doc.size)}</p>
                    </div>
                    <button
                      onClick={() => handleDownload(doc)}
                      className="px-3 py-1.5 text-sm font-medium text-white bg-[#000E9C] rounded hover:bg-[#4949FF] transition-colors"
                    >
                      Télécharger
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null
        )
      )}
    </div>
  );
};

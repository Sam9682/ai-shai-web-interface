import { useState, useEffect } from 'react';
import { eventService, type Event } from '../services/eventService';

export const AdminEventsPage = () => {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingEvent, setEditingEvent] = useState<Event | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    start_date: '',
    end_date: '',
    location: '',
    max_participants: '',
  });

  useEffect(() => {
    loadEvents();
  }, []);

  const loadEvents = async () => {
    try {
      setLoading(true);
      const data = await eventService.listEvents();
      setEvents(data);
    } catch (error) {
      console.error('Failed to load events:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (event: Event) => {
    setEditingEvent(event);
    setFormData({
      title: event.title,
      description: event.description || '',
      start_date: event.start_date.slice(0, 16),
      end_date: event.end_date.slice(0, 16),
      location: event.location || '',
      max_participants: event.max_participants?.toString() || '',
    });
  };

  const handleSave = async () => {
    if (!editingEvent) return;
    try {
      await eventService.updateEvent(editingEvent.id, {
        title: formData.title,
        description: formData.description || undefined,
        start_date: formData.start_date,
        end_date: formData.end_date,
        location: formData.location || undefined,
        max_participants: formData.max_participants ? parseInt(formData.max_participants) : undefined,
      });
      setEditingEvent(null);
      loadEvents();
    } catch (error) {
      console.error('Failed to update event:', error);
    }
  };

  const handleDelete = async (eventId: string) => {
    if (!confirm('Êtes-vous sûr de vouloir annuler cet événement ?')) return;
    try {
      await eventService.deleteEvent(eventId);
      loadEvents();
    } catch (error) {
      console.error('Failed to delete event:', error);
    }
  };

  const handleCreate = async () => {
    try {
      await eventService.createEvent({
        title: formData.title,
        description: formData.description || undefined,
        start_date: formData.start_date,
        end_date: formData.end_date,
        location: formData.location || undefined,
        max_participants: formData.max_participants ? parseInt(formData.max_participants) : undefined,
      });
      setShowCreateModal(false);
      setFormData({ title: '', description: '', start_date: '', end_date: '', location: '', max_participants: '' });
      loadEvents();
    } catch (error) {
      console.error('Failed to create event:', error);
    }
  };

  if (loading) {
    return <div className="text-center py-8 text-gray-500">Chargement...</div>;
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-[#000E9C]">Gestion des événements</h1>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 text-sm font-medium bg-[#000E9C] text-white rounded hover:bg-[#4949FF] transition-colors"
        >
          Nouvel événement
        </button>
      </div>

      <div className="grid gap-4">
        {events.map((event) => (
          <div key={event.id} className="card p-5">
            <div className="flex justify-between items-start">
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-gray-900 mb-1">{event.title}</h3>
                {event.description && <p className="text-sm text-gray-600 mb-2">{event.description}</p>}
                <div className="text-xs text-gray-500 space-y-0.5">
                  <p>Début : {new Date(event.start_date).toLocaleString('fr-FR')}</p>
                  <p>Fin : {new Date(event.end_date).toLocaleString('fr-FR')}</p>
                  {event.location && <p>Lieu : {event.location}</p>}
                  <p>Participants : {event.participant_count}{event.max_participants ? `/${event.max_participants}` : ''}</p>
                  <p>
                    <span className={`inline-block mt-1 px-2 py-0.5 rounded text-xs font-medium ${
                      event.status === 'scheduled' ? 'bg-green-100 text-green-800' :
                      event.status === 'cancelled' ? 'bg-red-100 text-red-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {event.status}
                    </span>
                  </p>
                </div>
              </div>
              <div className="flex gap-2 ml-4">
                <button
                  onClick={() => handleEdit(event)}
                  className="text-xs font-medium text-[#4949FF] hover:underline"
                >
                  Modifier
                </button>
                <button
                  onClick={() => handleDelete(event.id)}
                  className="text-xs font-medium text-red-600 hover:underline"
                >
                  Annuler
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Edit Modal */}
      {editingEvent && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold text-[#000E9C] mb-4">Modifier l'événement</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Titre</label>
                <input type="text" value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-[#4949FF] focus:border-transparent" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-[#4949FF] focus:border-transparent" rows={3} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Date de début</label>
                  <input type="datetime-local" value={formData.start_date} onChange={(e) => setFormData({ ...formData, start_date: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-[#4949FF] focus:border-transparent" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Date de fin</label>
                  <input type="datetime-local" value={formData.end_date} onChange={(e) => setFormData({ ...formData, end_date: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-[#4949FF] focus:border-transparent" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Lieu</label>
                <input type="text" value={formData.location} onChange={(e) => setFormData({ ...formData, location: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-[#4949FF] focus:border-transparent" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre max de participants</label>
                <input type="number" value={formData.max_participants} onChange={(e) => setFormData({ ...formData, max_participants: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-[#4949FF] focus:border-transparent" />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button onClick={() => setEditingEvent(null)} className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded hover:bg-gray-50 transition-colors">
                  Annuler
                </button>
                <button onClick={handleSave} className="px-4 py-2 text-sm font-medium text-white bg-[#000E9C] rounded hover:bg-[#4949FF] transition-colors">
                  Enregistrer
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold text-[#000E9C] mb-4">Nouvel événement</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Titre</label>
                <input type="text" value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-[#4949FF] focus:border-transparent" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-[#4949FF] focus:border-transparent" rows={3} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Date de début</label>
                  <input type="datetime-local" value={formData.start_date} onChange={(e) => setFormData({ ...formData, start_date: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-[#4949FF] focus:border-transparent" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Date de fin</label>
                  <input type="datetime-local" value={formData.end_date} onChange={(e) => setFormData({ ...formData, end_date: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-[#4949FF] focus:border-transparent" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Lieu</label>
                <input type="text" value={formData.location} onChange={(e) => setFormData({ ...formData, location: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-[#4949FF] focus:border-transparent" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nombre max de participants</label>
                <input type="number" value={formData.max_participants} onChange={(e) => setFormData({ ...formData, max_participants: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-[#4949FF] focus:border-transparent" />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button onClick={() => setShowCreateModal(false)} className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded hover:bg-gray-50 transition-colors">
                  Annuler
                </button>
                <button onClick={handleCreate} className="px-4 py-2 text-sm font-medium text-white bg-[#000E9C] rounded hover:bg-[#4949FF] transition-colors">
                  Créer
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

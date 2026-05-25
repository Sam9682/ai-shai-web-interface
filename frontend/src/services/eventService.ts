import api from './api';

export interface Event {
  id: string;
  title: string;
  description: string | null;
  start_date: string;
  end_date: string;
  location: string | null;
  max_participants: number | null;
  created_by: string;
  status: string;
  created_at: string;
  updated_at: string;
  participant_count: number;
}

export interface CreateEventRequest {
  title: string;
  description?: string;
  start_date: string;
  end_date: string;
  location?: string;
  max_participants?: number;
}

export interface UpdateEventRequest {
  title?: string;
  description?: string;
  start_date?: string;
  end_date?: string;
  location?: string;
  max_participants?: number;
}

export const eventService = {
  async listEvents(): Promise<Event[]> {
    const response = await api.get('/events');
    return response.data.events;
  },

  async createEvent(data: CreateEventRequest): Promise<void> {
    await api.post('/events', data);
  },

  async updateEvent(eventId: string, data: UpdateEventRequest): Promise<void> {
    await api.put(`/events/${eventId}`, data);
  },

  async deleteEvent(eventId: string): Promise<void> {
    await api.put(`/events/${eventId}/cancel`);
  },
};

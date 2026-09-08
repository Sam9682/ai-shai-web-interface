import api from './api';

export interface StaticContentResponse {
  slug: string;
  content: string;
  updated_at?: string;
}

export interface ClientAnswersResponse {
  slug: string;
  answers: Record<string, string>;
}

export const prerequisitesService = {
  // Static content (Basics, Network Flux)
  async loadStaticContent(slug: string): Promise<StaticContentResponse> {
    const response = await api.get(`/prerequisites/${slug}/content`);
    return response.data;
  },

  async saveStaticContent(slug: string, content: string): Promise<void> {
    await api.put(`/prerequisites/${slug}/content`, { content });
  },

  // Client answers (Network Checklist, Core Control Plane, CloudStore, VCF)
  async loadClientAnswers(slug: string): Promise<ClientAnswersResponse> {
    const response = await api.get(`/prerequisites/${slug}/answers`);
    return response.data;
  },

  async saveClientAnswer(slug: string, rowId: string, answer: string): Promise<void> {
    await api.put(`/prerequisites/${slug}/answers/${rowId}`, { answer });
  },
};

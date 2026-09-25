import api from './api';

export interface StaticContentResponse {
  slug: string;
  content: string;
  updated_at?: string;
  installation_id?: string;
}

export interface ClientAnswersResponse {
  slug: string;
  answers: Record<string, string>;
}

/** A named OPCP prerequisites Installation (multi-instance scoping). */
export interface Installation {
  id: string;
  project_name: string;
  created_at: string;
  updated_at: string;
}

export const prerequisitesService = {
  // Installations (multi-instance CRUD)
  async listInstallations(): Promise<Installation[]> {
    const response = await api.get('/prerequisites/installations');
    // Backend returns { installations: Installation[] }.
    return response.data?.installations ?? [];
  },

  async createInstallation(projectName: string): Promise<Installation> {
    const response = await api.post('/prerequisites/installations', {
      project_name: projectName,
    });
    return response.data;
  },

  async updateInstallation(id: string, projectName: string): Promise<Installation> {
    const response = await api.put(`/prerequisites/installations/${id}`, {
      project_name: projectName,
    });
    return response.data;
  },

  async deleteInstallation(id: string): Promise<void> {
    await api.delete(`/prerequisites/installations/${id}`);
  },

  // Static content (Basics, Network Flux) — scoped to an Installation.
  async loadStaticContent(
    installationId: string,
    slug: string,
  ): Promise<StaticContentResponse> {
    const response = await api.get(
      `/prerequisites/installations/${installationId}/${slug}/content`,
    );
    return response.data;
  },

  async saveStaticContent(
    installationId: string,
    slug: string,
    content: string,
  ): Promise<void> {
    await api.put(
      `/prerequisites/installations/${installationId}/${slug}/content`,
      { content },
    );
  },

  // Client answers (Network Checklist, Core Control Plane, CloudStore, VCF) —
  // scoped to an Installation.
  async loadClientAnswers(
    installationId: string,
    slug: string,
  ): Promise<ClientAnswersResponse> {
    const response = await api.get(
      `/prerequisites/installations/${installationId}/${slug}/answers`,
    );
    return response.data;
  },

  async saveClientAnswer(
    installationId: string,
    slug: string,
    rowId: string,
    answer: string,
  ): Promise<void> {
    await api.put(
      `/prerequisites/installations/${installationId}/${slug}/answers/${rowId}`,
      { answer },
    );
  },
};

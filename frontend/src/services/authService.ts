import api from './api';

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface RegistrationData {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user?: {
    id: string;
    email: string;
    first_name: string;
    last_name: string;
    role: string;
    is_email_verified: boolean;
  };
}

export const authService = {
  async login(credentials: LoginCredentials): Promise<AuthResponse> {
    const response = await api.post('/auth/login', credentials);
    const { access_token, user } = response.data;
    localStorage.setItem('access_token', access_token);
    if (user) {
      localStorage.setItem('user_role', user.role);
      localStorage.setItem('user', JSON.stringify(user));
    }
    return response.data;
  },

  async register(data: RegistrationData): Promise<void> {
    // Convertir les noms de champs en snake_case pour le backend
    await api.post('/auth/register', {
      email: data.email,
      password: data.password,
      first_name: data.firstName,
      last_name: data.lastName,
    });
  },

  async logout(): Promise<void> {
    await api.post('/auth/logout');
    localStorage.removeItem('access_token');
    localStorage.removeItem('user_role');
    localStorage.removeItem('user');
  },

  async verifyEmail(token: string): Promise<void> {
    await api.post('/auth/verify-email', { token });
  },

  async requestPasswordReset(email: string): Promise<void> {
    await api.post('/auth/password-reset', { email });
  },

  async resetPassword(token: string, newPassword: string): Promise<void> {
    await api.post('/auth/password-reset/confirm', { 
      token, 
      new_password: newPassword 
    });
  },

  isAuthenticated(): boolean {
    return !!localStorage.getItem('access_token');
  },

  isAdmin(): boolean {
    return localStorage.getItem('user_role') === 'administrator';
  },
};

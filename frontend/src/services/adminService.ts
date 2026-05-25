import api from './api';

export interface User {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: string;
  is_email_verified: boolean;
  membership_expires_at: string | null;
  membership_status: string;
  created_at: string;
}

export interface UserListResponse {
  members: User[];
  total: number;
}

export interface UpdateUserRequest {
  email?: string;
  first_name?: string;
  last_name?: string;
  role?: string;
}

export interface CreateUserRequest {
  email: string;
  password: string;
  first_name: string;
  last_name: string;
  role: string;
}

export const adminService = {
  async listUsers(): Promise<UserListResponse> {
    const response = await api.get('/admin/members');
    return response.data;
  },

  async updateUserRole(userId: string, role: string): Promise<void> {
    await api.put(`/admin/members/${userId}/role`, { role });
  },

  async updateMembershipStatus(userId: string, membershipExpiresAt: string | null, membershipStatus?: string): Promise<void> {
    const payload: any = { 
      membership_expires_at: membershipExpiresAt 
    };
    if (membershipStatus) {
      payload.membership_status = membershipStatus;
    }
    await api.put(`/admin/members/${userId}/membership-status`, payload);
  },

  async updateEmailVerification(userId: string, isEmailVerified: boolean): Promise<void> {
    await api.put(`/admin/members/${userId}/email-verification`, { 
      is_email_verified: isEmailVerified 
    });
  },

  async deleteUser(userId: string): Promise<void> {
    await api.put(`/admin/members/${userId}/deactivate`);
  },

  async createUser(data: CreateUserRequest): Promise<void> {
    await api.post('/auth/register', {
      email: data.email,
      password: data.password,
      first_name: data.first_name,
      last_name: data.last_name,
    });
  },
};

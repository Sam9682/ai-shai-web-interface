import { useState, useEffect } from 'react';
import { adminService, type User } from '../services/adminService';

export const AdminUsersPage = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    first_name: '',
    last_name: '',
    role: 'member',
    password: '',
    membership_expires_at: '',
    membership_status: '',
  });

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      setLoading(true);
      const response = await adminService.listUsers();
      setUsers(response.members);
    } catch (error) {
      console.error('Failed to load users:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (user: User) => {
    setEditingUser(user);
    const expiresAt = user.membership_expires_at 
      ? new Date(user.membership_expires_at).toISOString().slice(0, 16)
      : '';
    setFormData({
      email: user.email,
      first_name: user.first_name,
      last_name: user.last_name,
      role: user.role,
      password: '',
      membership_expires_at: expiresAt,
      membership_status: user.membership_status,
    });
  };

  const handleStatusChange = (newStatus: string) => {
    setFormData({ ...formData, membership_status: newStatus });
  };

  const handleSave = async () => {
    if (!editingUser) return;
    try {
      await adminService.updateUserRole(editingUser.id, formData.role);
      const membershipExpiresAt = formData.membership_expires_at 
        ? new Date(formData.membership_expires_at).toISOString()
        : null;
      await adminService.updateMembershipStatus(editingUser.id, membershipExpiresAt, formData.membership_status);
      const previousStatus = editingUser.membership_status;
      const newStatus = formData.membership_status;
      if ((previousStatus === 'pending' || previousStatus === 'expired') && newStatus === 'active') {
        await adminService.updateEmailVerification(editingUser.id, true);
      }
      setEditingUser(null);
      loadUsers();
    } catch (error) {
      console.error('Failed to update user:', error);
    }
  };

  const handleDelete = async (userId: string) => {
    if (!confirm('Êtes-vous sûr de vouloir désactiver cet utilisateur ?')) return;
    try {
      await adminService.deleteUser(userId);
      loadUsers();
    } catch (error) {
      console.error('Failed to delete user:', error);
    }
  };

  const handleCreate = async () => {
    try {
      await adminService.createUser({
        email: formData.email,
        password: formData.password,
        first_name: formData.first_name,
        last_name: formData.last_name,
        role: formData.role,
      });
      setShowCreateModal(false);
      setFormData({ email: '', first_name: '', last_name: '', role: 'member', password: '', membership_expires_at: '', membership_status: '' });
      loadUsers();
    } catch (error) {
      console.error('Failed to create user:', error);
    }
  };

  if (loading) {
    return <div className="text-center py-8 text-gray-500">Chargement...</div>;
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <h1 className="text-2xl font-bold text-[#000E9C]">Gestion des utilisateurs</h1>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 text-sm font-medium bg-[#000E9C] text-white rounded hover:bg-[#4949FF] transition-colors"
        >
          Nouvel utilisateur
        </button>
      </div>

      <div className="card overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nom</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Prénom</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Rôle</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Statut</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {users.map((user) => (
              <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3 text-sm text-gray-900">{user.email}</td>
                <td className="px-4 py-3 text-sm text-gray-700">{user.last_name}</td>
                <td className="px-4 py-3 text-sm text-gray-700">{user.first_name}</td>
                <td className="px-4 py-3 text-sm">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                    user.role === 'administrator' ? 'bg-purple-100 text-purple-800' :
                    user.role === 'member' ? 'bg-blue-100 text-blue-800' :
                    'bg-gray-100 text-gray-800'
                  }`}>
                    {user.role}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                    user.membership_status === 'active' ? 'bg-green-100 text-green-800' :
                    user.membership_status === 'expired' ? 'bg-red-100 text-red-800' :
                    'bg-yellow-100 text-yellow-800'
                  }`}>
                    {user.membership_status}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm space-x-3">
                  <button onClick={() => handleEdit(user)} className="text-xs font-medium text-[#4949FF] hover:underline">
                    Modifier
                  </button>
                  <button onClick={() => handleDelete(user.id)} className="text-xs font-medium text-red-600 hover:underline">
                    Désactiver
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Edit Modal */}
      {editingUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold text-[#000E9C] mb-4">Modifier l'utilisateur</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input type="email" value={formData.email} disabled className="w-full px-3 py-2 border border-gray-300 rounded text-sm bg-gray-50 text-gray-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Rôle</label>
                <select value={formData.role} onChange={(e) => setFormData({ ...formData, role: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-[#4949FF] focus:border-transparent">
                  <option value="visitor">Visiteur</option>
                  <option value="member">Membre</option>
                  <option value="administrator">Administrateur</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Statut d'adhésion</label>
                <select value={formData.membership_status} onChange={(e) => handleStatusChange(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-[#4949FF] focus:border-transparent">
                  <option value="pending">En attente</option>
                  <option value="active">Actif</option>
                  <option value="expired">Expiré</option>
                </select>
                {editingUser && 
                 (editingUser.membership_status === 'pending' || editingUser.membership_status === 'expired') && 
                 formData.membership_status === 'active' && (
                  <p className="text-xs text-green-600 mt-1">L'email sera automatiquement vérifié</p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date d'expiration</label>
                <input type="datetime-local" value={formData.membership_expires_at} onChange={(e) => setFormData({ ...formData, membership_expires_at: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-[#4949FF] focus:border-transparent" />
                <p className="text-xs text-gray-500 mt-1">Laissez vide pour une adhésion à vie</p>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button onClick={() => setEditingUser(null)} className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded hover:bg-gray-50 transition-colors">
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
          <div className="bg-white rounded-lg p-6 w-full max-w-md max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold text-[#000E9C] mb-4">Nouvel utilisateur</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-[#4949FF] focus:border-transparent" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Prénom</label>
                <input type="text" value={formData.first_name} onChange={(e) => setFormData({ ...formData, first_name: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-[#4949FF] focus:border-transparent" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nom</label>
                <input type="text" value={formData.last_name} onChange={(e) => setFormData({ ...formData, last_name: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-[#4949FF] focus:border-transparent" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Mot de passe</label>
                <input type="password" value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-[#4949FF] focus:border-transparent" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Rôle</label>
                <select value={formData.role} onChange={(e) => setFormData({ ...formData, role: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-[#4949FF] focus:border-transparent">
                  <option value="visitor">Visiteur</option>
                  <option value="member">Membre</option>
                  <option value="administrator">Administrateur</option>
                </select>
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

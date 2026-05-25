import type { ReactNode } from 'react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { authService } from '../services/authService';
import hypervisiaLogo from '../assets/hypervisia.png';

interface LayoutProps {
  children: ReactNode;
}

export const Layout = ({ children }: LayoutProps) => {
  const isAuthenticated = authService.isAuthenticated();
  const isAdmin = authService.isAdmin();
  const [showEventsMenu, setShowEventsMenu] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLogout = async () => {
    try {
      await authService.logout();
      window.location.href = '/';
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  return (
    <div className="min-h-screen">
      <nav className="bg-white/80 backdrop-blur-md shadow-lg sticky top-0 z-50 border-b border-primary-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16">
            <div className="flex">
              <Link to="/" className="flex items-center text-xl font-bold bg-gradient-to-r from-primary-600 to-purple-600 bg-clip-text text-transparent hover:from-primary-700 hover:to-purple-700 transition-all">
                <img src={hypervisiaLogo} alt="HYPERVIS-IA" className="h-32 w-auto mr-2 object-contain" />
              </Link>
              {/* Desktop Menu */}
              <div className="hidden sm:ml-8 sm:flex sm:space-x-6">
                <Link to="/" className="inline-flex items-center px-3 pt-1 text-sm font-medium text-gray-700 hover:text-primary-600 transition-colors border-b-2 border-transparent hover:border-primary-600">
                  <span className="mr-1">🏠</span> Accueil
                </Link>
                {isAuthenticated && (
                  <>
                    <Link to="/forum" className="inline-flex items-center px-3 pt-1 text-sm font-medium text-gray-700 hover:text-primary-600 transition-colors border-b-2 border-transparent hover:border-primary-600">
                      <span className="mr-1">💬</span> Forum
                    </Link>
                    <div className="relative" onMouseEnter={() => setShowEventsMenu(true)} onMouseLeave={() => setShowEventsMenu(false)}>
                      <Link to="/events" className="inline-flex items-center px-3 pt-1 text-sm font-medium text-gray-700 hover:text-primary-600 transition-colors border-b-2 border-transparent hover:border-primary-600">
                        <span className="mr-1">📅</span> Événements {isAdmin && <span className="ml-1">▾</span>}
                      </Link>
                      {isAdmin && showEventsMenu && (
                        <div className="absolute top-full left-0 mt-1 w-48 bg-white rounded-lg shadow-lg border border-gray-200 py-2 z-50">
                          <Link to="/admin/events" className="block px-4 py-2 text-sm text-gray-700 hover:bg-primary-50 hover:text-primary-600">
                            ➕ Gérer les événements
                          </Link>
                        </div>
                      )}
                    </div>
                    <Link to="/documents" className="inline-flex items-center px-3 pt-1 text-sm font-medium text-gray-700 hover:text-primary-600 transition-colors border-b-2 border-transparent hover:border-primary-600">
                      <span className="mr-1">📄</span> Documents
                    </Link>
                    <Link to="/oracle" className="inline-flex items-center px-3 pt-1 text-sm font-medium text-gray-700 hover:text-primary-600 transition-colors border-b-2 border-transparent hover:border-primary-600">
                      <span className="mr-1">🔮</span> L'Oracle (AI)
                    </Link>
                    {isAdmin && (
                      <Link to="/admin/users" className="inline-flex items-center px-3 pt-1 text-sm font-medium text-gray-700 hover:text-primary-600 transition-colors border-b-2 border-transparent hover:border-primary-600">
                        <span className="mr-1">👥</span> Utilisateurs
                      </Link>
                    )}
                  </>
                )}
              </div>
            </div>
            {/* Desktop Auth Buttons */}
            <div className="hidden sm:flex items-center">
              {isAuthenticated ? (
                <button
                  onClick={handleLogout}
                  className="ml-3 inline-flex items-center px-5 py-2 text-sm font-semibold rounded-lg text-white bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 shadow-md hover:shadow-lg transition-all duration-300"
                >
                  <span className="mr-1">👋</span> Déconnexion
                </button>
              ) : (
                <div className="flex space-x-3">
                  <Link
                    to="/login"
                    className="inline-flex items-center px-5 py-2 text-sm font-semibold rounded-lg text-primary-700 bg-white border-2 border-primary-600 hover:bg-primary-50 shadow-sm hover:shadow-md transition-all duration-300"
                  >
                    <span className="mr-1">🔐</span> Connexion
                  </Link>
                  <Link
                    to="/register"
                    className="inline-flex items-center px-5 py-2 text-sm font-semibold rounded-lg text-white bg-gradient-to-r from-primary-600 to-purple-600 hover:from-primary-700 hover:to-purple-700 shadow-md hover:shadow-lg transition-all duration-300"
                  >
                    <span className="mr-1">✨</span> Inscription
                  </Link>
                </div>
              )}
            </div>
            {/* Mobile Menu Button */}
            <div className="flex items-center sm:hidden">
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="inline-flex items-center justify-center p-2 rounded-md text-gray-700 hover:text-primary-600 hover:bg-primary-50 transition-colors"
                aria-label="Menu"
              >
                {mobileMenuOpen ? (
                  <span className="text-2xl">✕</span>
                ) : (
                  <span className="text-2xl">☰</span>
                )}
              </button>
            </div>
          </div>
        </div>
        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="sm:hidden border-t border-primary-100">
            <div className="px-2 pt-2 pb-3 space-y-1">
              <Link
                to="/"
                onClick={() => setMobileMenuOpen(false)}
                className="block px-3 py-2 rounded-md text-base font-medium text-gray-700 hover:text-primary-600 hover:bg-primary-50 transition-colors"
              >
                <span className="mr-2">🏠</span> Accueil
              </Link>
              {isAuthenticated && (
                <>
                  <Link
                    to="/forum"
                    onClick={() => setMobileMenuOpen(false)}
                    className="block px-3 py-2 rounded-md text-base font-medium text-gray-700 hover:text-primary-600 hover:bg-primary-50 transition-colors"
                  >
                    <span className="mr-2">💬</span> Forum
                  </Link>
                  <Link
                    to="/events"
                    onClick={() => setMobileMenuOpen(false)}
                    className="block px-3 py-2 rounded-md text-base font-medium text-gray-700 hover:text-primary-600 hover:bg-primary-50 transition-colors"
                  >
                    <span className="mr-2">📅</span> Événements
                  </Link>
                  {isAdmin && (
                    <Link
                      to="/admin/events"
                      onClick={() => setMobileMenuOpen(false)}
                      className="block px-3 py-2 pl-8 rounded-md text-sm font-medium text-gray-600 hover:text-primary-600 hover:bg-primary-50 transition-colors"
                    >
                      <span className="mr-2">➕</span> Gérer les événements
                    </Link>
                  )}
                  <Link
                    to="/documents"
                    onClick={() => setMobileMenuOpen(false)}
                    className="block px-3 py-2 rounded-md text-base font-medium text-gray-700 hover:text-primary-600 hover:bg-primary-50 transition-colors"
                  >
                    <span className="mr-2">📄</span> Documents
                  </Link>
                  <Link
                    to="/oracle"
                    onClick={() => setMobileMenuOpen(false)}
                    className="block px-3 py-2 rounded-md text-base font-medium text-gray-700 hover:text-primary-600 hover:bg-primary-50 transition-colors"
                  >
                    <span className="mr-2">🔮</span> L'Oracle (AI)
                  </Link>
                  {isAdmin && (
                    <Link
                      to="/admin/users"
                      onClick={() => setMobileMenuOpen(false)}
                      className="block px-3 py-2 rounded-md text-base font-medium text-gray-700 hover:text-primary-600 hover:bg-primary-50 transition-colors"
                    >
                      <span className="mr-2">👥</span> Utilisateurs
                    </Link>
                  )}
                </>
              )}
              {/* Mobile Auth Buttons */}
              <div className="pt-4 border-t border-gray-200 mt-4">
                {isAuthenticated ? (
                  <button
                    onClick={() => {
                      setMobileMenuOpen(false);
                      handleLogout();
                    }}
                    className="w-full text-left px-3 py-2 rounded-md text-base font-medium text-white bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 transition-all"
                  >
                    <span className="mr-2">👋</span> Déconnexion
                  </button>
                ) : (
                  <div className="space-y-2">
                    <Link
                      to="/login"
                      onClick={() => setMobileMenuOpen(false)}
                      className="block w-full text-center px-3 py-2 rounded-md text-base font-medium text-primary-700 bg-white border-2 border-primary-600 hover:bg-primary-50 transition-all"
                    >
                      <span className="mr-2">🔐</span> Connexion
                    </Link>
                    <Link
                      to="/register"
                      onClick={() => setMobileMenuOpen(false)}
                      className="block w-full text-center px-3 py-2 rounded-md text-base font-medium text-white bg-gradient-to-r from-primary-600 to-purple-600 hover:from-primary-700 hover:to-purple-700 transition-all"
                    >
                      <span className="mr-2">✨</span> Inscription
                    </Link>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </nav>
      <main className="max-w-7xl mx-auto py-8 sm:px-6 lg:px-8">
        {children}
      </main>
      <footer className="bg-white/80 backdrop-blur-md border-t border-primary-100 mt-16">
        <div className="max-w-7xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
          <div className="text-center text-gray-600">
            <p className="text-sm">© 2026 HYPERVISIA - Association loi 1901 - N° W913016363</p>
            <p className="text-xs mt-2">🤖 Développé et hébergé sur OVH par des agents virtuels IA - softfluid.fr</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

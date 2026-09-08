import type { ReactNode } from 'react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { authService } from '../services/authService';
import { PREREQ_NAV_ITEMS } from './prerequisites/types';

interface LayoutProps {
  children: ReactNode;
}

export const Layout = ({ children }: LayoutProps) => {
  const isAuthenticated = authService.isAuthenticated();
  const isAdmin = authService.isAdmin();
  const [showEventsMenu, setShowEventsMenu] = useState(false);
  const [showPrereqMenu, setShowPrereqMenu] = useState(false);
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
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <nav className="sticky top-0 z-50 bg-[#000E9C] text-white h-14 flex items-center px-4 sm:px-6">
        <div className="max-w-7xl w-full mx-auto flex items-center justify-between">
          <div className="flex items-center gap-8">
            <Link to="/" className="text-lg font-bold text-white hover:no-underline">
              OPCP
            </Link>
            {/* Desktop Menu */}
            <div className="hidden sm:flex items-center gap-1">
              <Link to="/" className="px-3 py-1.5 text-sm font-medium text-white/90 hover:text-white hover:bg-white/10 rounded transition-colors hover:no-underline">
                Accueil
              </Link>
              {isAuthenticated && (
                <>
                  <Link to="/forum" className="px-3 py-1.5 text-sm font-medium text-white/90 hover:text-white hover:bg-white/10 rounded transition-colors hover:no-underline">
                    Forum
                  </Link>
                  <div className="relative" onMouseEnter={() => setShowEventsMenu(true)} onMouseLeave={() => setShowEventsMenu(false)}>
                    <Link to="/events" className="px-3 py-1.5 text-sm font-medium text-white/90 hover:text-white hover:bg-white/10 rounded transition-colors hover:no-underline">
                      Événements {isAdmin && <span className="ml-0.5 text-xs">▾</span>}
                    </Link>
                    {isAdmin && showEventsMenu && (
                      <div className="absolute top-full left-0 mt-1 w-48 bg-white rounded shadow-lg border border-gray-200 py-1 z-50">
                        <Link to="/admin/events" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 hover:no-underline">
                          Gérer les événements
                        </Link>
                      </div>
                    )}
                  </div>
                  <Link to="/documents" className="px-3 py-1.5 text-sm font-medium text-white/90 hover:text-white hover:bg-white/10 rounded transition-colors hover:no-underline">
                    Documents
                  </Link>
                  <Link to="/oracle" className="px-3 py-1.5 text-sm font-medium text-white/90 hover:text-white hover:bg-white/10 rounded transition-colors hover:no-underline">
                    Oracle IA
                  </Link>
                  <div className="relative" onMouseEnter={() => setShowPrereqMenu(true)} onMouseLeave={() => setShowPrereqMenu(false)}>
                    <span className="px-3 py-1.5 text-sm font-medium text-white/90 hover:text-white hover:bg-white/10 rounded transition-colors cursor-pointer">
                      OPCP installation prerequisites <span className="ml-0.5 text-xs">▾</span>
                    </span>
                    {showPrereqMenu && (
                      <div className="absolute top-full left-0 mt-1 w-56 bg-white rounded shadow-lg border border-gray-200 py-1 z-50">
                        {PREREQ_NAV_ITEMS.map((item) => (
                          <Link key={item.route} to={item.route} className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 hover:no-underline">
                            {item.label}
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                  {isAdmin && (
                    <Link to="/admin/users" className="px-3 py-1.5 text-sm font-medium text-white/90 hover:text-white hover:bg-white/10 rounded transition-colors hover:no-underline">
                      Utilisateurs
                    </Link>
                  )}
                </>
              )}
            </div>
          </div>
          {/* Desktop Auth */}
          <div className="hidden sm:flex items-center gap-2">
            {isAuthenticated ? (
              <button
                onClick={handleLogout}
                className="px-4 py-1.5 text-sm font-medium bg-white/15 border border-white/30 text-white rounded hover:bg-white/25 transition-colors"
              >
                Déconnexion
              </button>
            ) : (
              <div className="flex gap-2">
                <Link
                  to="/login"
                  className="px-4 py-1.5 text-sm font-medium bg-white/15 border border-white/30 text-white rounded hover:bg-white/25 transition-colors hover:no-underline"
                >
                  Connexion
                </Link>
                <Link
                  to="/register"
                  className="px-4 py-1.5 text-sm font-medium bg-white text-[#000E9C] rounded hover:bg-gray-100 transition-colors hover:no-underline"
                >
                  Inscription
                </Link>
              </div>
            )}
          </div>
          {/* Mobile Menu Button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="sm:hidden text-white text-xl p-1"
            aria-label="Menu"
          >
            {mobileMenuOpen ? '✕' : '☰'}
          </button>
        </div>
      </nav>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="sm:hidden bg-white border-b border-gray-200 shadow-md">
          <div className="px-4 py-3 space-y-1">
            <Link to="/" onClick={() => setMobileMenuOpen(false)} className="block px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 rounded hover:no-underline">
              Accueil
            </Link>
            {isAuthenticated && (
              <>
                <Link to="/forum" onClick={() => setMobileMenuOpen(false)} className="block px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 rounded hover:no-underline">
                  Forum
                </Link>
                <Link to="/events" onClick={() => setMobileMenuOpen(false)} className="block px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 rounded hover:no-underline">
                  Événements
                </Link>
                {isAdmin && (
                  <Link to="/admin/events" onClick={() => setMobileMenuOpen(false)} className="block px-3 py-2 pl-6 text-sm text-gray-600 hover:bg-gray-50 rounded hover:no-underline">
                    Gérer les événements
                  </Link>
                )}
                <Link to="/documents" onClick={() => setMobileMenuOpen(false)} className="block px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 rounded hover:no-underline">
                  Documents
                </Link>
                <Link to="/oracle" onClick={() => setMobileMenuOpen(false)} className="block px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 rounded hover:no-underline">
                  Oracle IA
                </Link>
                <div className="px-3 py-2 text-sm font-medium text-gray-700">OPCP installation prerequisites</div>
                {PREREQ_NAV_ITEMS.map((item) => (
                  <Link
                    key={item.route}
                    to={item.route}
                    onClick={() => setMobileMenuOpen(false)}
                    className="block px-3 py-2 pl-6 text-sm text-gray-600 hover:bg-gray-50 rounded hover:no-underline"
                  >
                    {item.label}
                  </Link>
                ))}
                {isAdmin && (
                  <Link to="/admin/users" onClick={() => setMobileMenuOpen(false)} className="block px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 rounded hover:no-underline">
                    Utilisateurs
                  </Link>
                )}
              </>
            )}
            <div className="pt-3 mt-3 border-t border-gray-200">
              {isAuthenticated ? (
                <button
                  onClick={() => { setMobileMenuOpen(false); handleLogout(); }}
                  className="w-full text-left px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 rounded"
                >
                  Déconnexion
                </button>
              ) : (
                <div className="space-y-2">
                  <Link to="/login" onClick={() => setMobileMenuOpen(false)} className="block px-3 py-2 text-sm font-medium text-[#000E9C] hover:bg-gray-50 rounded hover:no-underline">
                    Connexion
                  </Link>
                  <Link to="/register" onClick={() => setMobileMenuOpen(false)} className="block px-3 py-2 text-sm font-medium text-white bg-[#000E9C] rounded text-center hover:no-underline">
                    Inscription
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto py-8 px-4 sm:px-6 lg:px-8">
        {children}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 py-4">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-sm text-gray-500">© 2026 OPCP — opcp-psmc.com</p>
        </div>
      </footer>
    </div>
  );
};

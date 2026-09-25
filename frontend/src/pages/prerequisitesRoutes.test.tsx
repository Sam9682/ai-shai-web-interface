import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import fc from 'fast-check';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ProtectedRoute } from '../components/ProtectedRoute';
import { LanguageProvider } from '../hooks/useLanguage';
import { HowToUsePage } from './HowToUsePage';
import { InstallationListPage } from '../components/prerequisites/InstallationListPage';
import { InstallationPrereqPage } from './InstallationPrereqPage';

// The installation-scoped pages call prerequisitesService on mount
// (loadStaticContent / loadClientAnswers) and the list page calls
// listInstallations. Mock the module so those loads resolve to empty
// content/answers/lists and never hit the network, isolating route/guard
// behavior. HowToUse makes no service calls.
vi.mock('../services/prerequisitesService', () => ({
  prerequisitesService: {
    listInstallations: vi.fn().mockResolvedValue([]),
    createInstallation: vi.fn().mockResolvedValue({}),
    updateInstallation: vi.fn().mockResolvedValue({}),
    deleteInstallation: vi.fn().mockResolvedValue(undefined),
    loadStaticContent: vi.fn().mockResolvedValue({ slug: '', content: '' }),
    saveStaticContent: vi.fn().mockResolvedValue(undefined),
    loadClientAnswers: vi.fn().mockResolvedValue({ slug: '', answers: {} }),
    saveClientAnswer: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mirrors the prerequisites route structure declared in App.tsx: the global
// how-to-use page, the installation list entry point, and a single
// installation-scoped page mounted at
// /prerequisites/installations/:installationId/:slug. Each is wrapped in a
// ProtectedRoute, with a recognizable /login placeholder used to detect the
// auth-guard redirect.
function renderPrereqRoutes(initialEntry: string) {
  // The prerequisites pages call useTranslation(), so wrap the routes in a
  // LanguageProvider.
  return render(
    <LanguageProvider>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/login" element={<div>Login Placeholder</div>} />
          <Route
            path="/prerequisites/how-to-use"
            element={
              <ProtectedRoute>
                <HowToUsePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/prerequisites/installations"
            element={
              <ProtectedRoute>
                <InstallationListPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/prerequisites/installations/:installationId/:slug"
            element={
              <ProtectedRoute>
                <InstallationPrereqPage />
              </ProtectedRoute>
            }
          />
        </Routes>
      </MemoryRouter>
    </LanguageProvider>,
  );
}

// Each prerequisites route paired with the heading title rendered by its page.
// - HowToUse renders <h1>Comment utiliser</h1>
// - InstallationListPage renders <h1>{t('prereq.installations.title')}</h1> = "Installations"
// - InstallationPrereqPage → StaticContentPage / QuestionAnswerForm render <h1>{title}</h1>
const INSTALL_ID = '11111111-1111-1111-1111-111111111111';
const PREREQ_ROUTES: Array<{ route: string; title: string }> = [
  { route: '/prerequisites/how-to-use', title: 'Comment utiliser' },
  { route: '/prerequisites/installations', title: 'Installations' },
  { route: `/prerequisites/installations/${INSTALL_ID}/basics`, title: 'Basics' },
  {
    route: `/prerequisites/installations/${INSTALL_ID}/network-checklist`,
    title: 'Network Checklist',
  },
  {
    route: `/prerequisites/installations/${INSTALL_ID}/core-control-plane`,
    title: 'Core Control Plane',
  },
  { route: `/prerequisites/installations/${INSTALL_ID}/cloudstore`, title: 'CloudStore' },
  { route: `/prerequisites/installations/${INSTALL_ID}/vcf`, title: 'VCF' },
  {
    route: `/prerequisites/installations/${INSTALL_ID}/network-flux`,
    title: 'Network Flux',
  },
];

const LOGIN_PLACEHOLDER = 'Login Placeholder';

beforeEach(() => {
  localStorage.clear();
  cleanup();
});

// Validates: Requirements 5.1, 5.3
describe('prerequisites route wiring and auth guard', () => {
  describe('when authenticated', () => {
    for (const { route, title } of PREREQ_ROUTES) {
      it(`renders its page at ${route}`, () => {
        // Authenticated as a non-admin member: titles still render for every
        // archetype, and the auth guard lets the route through.
        localStorage.setItem('access_token', 'test-token');
        localStorage.setItem('user_role', 'member');

        renderPrereqRoutes(route);

        // The protected page is shown...
        expect(screen.getByText(title)).toBeInTheDocument();
        // ...and the auth-guard redirect target is not.
        expect(screen.queryByText(LOGIN_PLACEHOLDER)).not.toBeInTheDocument();
      });
    }
  });

  describe('when not authenticated', () => {
    for (const { route, title } of PREREQ_ROUTES) {
      it(`redirects ${route} to /login`, () => {
        // No access_token set: authService.isAuthenticated() is false.
        renderPrereqRoutes(route);

        // The auth guard redirects to the login route...
        expect(screen.getByText(LOGIN_PLACEHOLDER)).toBeInTheDocument();
        // ...and the protected page title is not rendered.
        expect(screen.queryByText(title)).not.toBeInTheDocument();
      });
    }
  });
});

// Minimum property-test iterations mandated by the design (>= 100).
const NUM_RUNS = 100;

// Quantify over the full set of prerequisites routes. Each run draws one
// { route, title } pair so the guard behaviour is exercised uniformly across
// every archetype rather than a fixed sequence.
const prereqRouteArb = fc.constantFrom(...PREREQ_ROUTES);

// Feature: multi-instance-opcp-prerequisites, Property: Authenticated access renders the matching prerequisites page
// Validates: Requirements 5.1, 5.3
describe('authenticated access renders the matching prerequisites page', () => {
  it('renders the page title and not the login placeholder for a random route when authenticated', async () => {
    await fc.assert(
      fc.property(prereqRouteArb, ({ route, title }) => {
        // Reset DOM + storage each run so state never leaks between draws.
        cleanup();
        localStorage.clear();
        // Authenticated as a non-admin member: the auth guard lets the route
        // through and every archetype renders its title.
        localStorage.setItem('access_token', 'test-token');
        localStorage.setItem('user_role', 'member');

        renderPrereqRoutes(route);

        // The protected page is shown...
        expect(screen.getByText(title)).toBeInTheDocument();
        // ...and the auth-guard redirect target is not.
        expect(screen.queryByText(LOGIN_PLACEHOLDER)).not.toBeInTheDocument();
      }),
      { numRuns: NUM_RUNS },
    );
  });
});

// Feature: multi-instance-opcp-prerequisites, Property: Unauthenticated access redirects to login
// Validates: Requirements 5.1, 5.3
describe('unauthenticated access redirects to login', () => {
  it('renders the login placeholder and not the page title for a random route when unauthenticated', async () => {
    await fc.assert(
      fc.property(prereqRouteArb, ({ route, title }) => {
        // Reset DOM + storage each run; leave access_token unset so
        // authService.isAuthenticated() is false.
        cleanup();
        localStorage.clear();

        renderPrereqRoutes(route);

        // The auth guard redirects to the login route...
        expect(screen.getByText(LOGIN_PLACEHOLDER)).toBeInTheDocument();
        // ...and the protected page title is not rendered.
        expect(screen.queryByText(title)).not.toBeInTheDocument();
      }),
      { numRuns: NUM_RUNS },
    );
  });
});

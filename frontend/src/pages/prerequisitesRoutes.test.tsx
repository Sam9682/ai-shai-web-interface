import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import fc from 'fast-check';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ProtectedRoute } from '../components/ProtectedRoute';
import { HowToUsePage } from './HowToUsePage';
import { BasicsPage } from './BasicsPage';
import { NetworkChecklistPage } from './NetworkChecklistPage';
import { CoreControlPlanePage } from './CoreControlPlanePage';
import { CloudStorePage } from './CloudStorePage';
import { VcfPage } from './VcfPage';
import { NetworkFluxPage } from './NetworkFluxPage';

// The static pages (Basics, Network Flux) and the question/answer pages
// (Network Checklist, Core Control Plane, CloudStore, VCF) call
// prerequisitesService on mount (loadStaticContent / loadClientAnswers). Mock
// the module so those loads resolve to empty content/answers and never hit the
// network, isolating route/guard behavior. HowToUse makes no service calls.
vi.mock('../services/prerequisitesService', () => ({
  prerequisitesService: {
    loadStaticContent: vi.fn().mockResolvedValue({ slug: '', content: '' }),
    saveStaticContent: vi.fn().mockResolvedValue(undefined),
    loadClientAnswers: vi.fn().mockResolvedValue({ slug: '', answers: {} }),
    saveClientAnswer: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mirrors the prerequisites route structure declared in App.tsx: each page is
// wrapped in a ProtectedRoute, with a recognizable /login placeholder used to
// detect the auth-guard redirect.
function renderPrereqRoutes(initialEntry: string) {
  return render(
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
          path="/prerequisites/basics"
          element={
            <ProtectedRoute>
              <BasicsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/prerequisites/network-checklist"
          element={
            <ProtectedRoute>
              <NetworkChecklistPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/prerequisites/core-control-plane"
          element={
            <ProtectedRoute>
              <CoreControlPlanePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/prerequisites/cloudstore"
          element={
            <ProtectedRoute>
              <CloudStorePage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/prerequisites/vcf"
          element={
            <ProtectedRoute>
              <VcfPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/prerequisites/network-flux"
          element={
            <ProtectedRoute>
              <NetworkFluxPage />
            </ProtectedRoute>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

// Each prerequisites route paired with the heading title rendered by its page.
// - HowToUse renders <h1>Comment utiliser</h1>
// - StaticContentPage renders <h1>{title}</h1>
// - QuestionAnswerForm renders <h1>{title}</h1>
const PREREQ_ROUTES: Array<{ route: string; title: string }> = [
  { route: '/prerequisites/how-to-use', title: 'Comment utiliser' },
  { route: '/prerequisites/basics', title: 'Basics' },
  { route: '/prerequisites/network-checklist', title: 'Network Checklist' },
  { route: '/prerequisites/core-control-plane', title: 'Core Control Plane' },
  { route: '/prerequisites/cloudstore', title: 'CloudStore' },
  { route: '/prerequisites/vcf', title: 'VCF' },
  { route: '/prerequisites/network-flux', title: 'Network Flux' },
];

const LOGIN_PLACEHOLDER = 'Login Placeholder';

beforeEach(() => {
  localStorage.clear();
  cleanup();
});

// Validates: Requirements 2.1, 2.2, 2.3, 2.4
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
// all seven archetypes rather than a fixed sequence.
const prereqRouteArb = fc.constantFrom(...PREREQ_ROUTES);

// Feature: opcp-prerequisites-tabs, Property 3: Authenticated access renders the matching prerequisites page
// Validates: Requirements 2.1, 2.4
describe('Property 3: authenticated access renders the matching prerequisites page', () => {
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

// Feature: opcp-prerequisites-tabs, Property 4: Unauthenticated access redirects to login
// Validates: Requirements 2.2, 2.3
describe('Property 4: unauthenticated access redirects to login', () => {
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

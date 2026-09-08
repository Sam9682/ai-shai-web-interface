import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { ProtectedRoute } from '../components/ProtectedRoute';
import { OPCPCorePage } from './OPCPCorePage';
import { CloudStorePage } from './CloudStorePage';
import { LandingZonePage } from './LandingZonePage';

// Mirrors the prerequisites route structure declared in App.tsx: each page is
// wrapped in a ProtectedRoute, with a recognizable /login placeholder used to
// detect the auth-guard redirect.
function renderPrereqRoutes(initialEntry: string) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/login" element={<div>Login Placeholder</div>} />
        <Route
          path="/prerequisites/opcp-core"
          element={
            <ProtectedRoute>
              <OPCPCorePage />
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
          path="/prerequisites/landingzone"
          element={
            <ProtectedRoute>
              <LandingZonePage />
            </ProtectedRoute>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

// Each prerequisites route paired with the page title rendered by its
// TrackingForm wrapper.
const PREREQ_ROUTES: Array<{ route: string; title: string }> = [
  { route: '/prerequisites/opcp-core', title: 'OPCP Core' },
  { route: '/prerequisites/cloudstore', title: 'CloudStore' },
  { route: '/prerequisites/landingzone', title: 'LandingZone' },
];

const LOGIN_PLACEHOLDER = 'Login Placeholder';

beforeEach(() => {
  localStorage.clear();
  cleanup();
});

// Validates: Requirements 3.1, 3.2, 3.3, 3.4
describe('prerequisites route wiring and auth guard', () => {
  describe('when authenticated', () => {
    for (const { route, title } of PREREQ_ROUTES) {
      it(`renders its page at ${route}`, () => {
        localStorage.setItem('access_token', 'test-token');

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

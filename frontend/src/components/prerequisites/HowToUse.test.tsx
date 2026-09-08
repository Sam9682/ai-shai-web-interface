import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { HowToUse } from './HowToUse';
import { PREREQ_MARKERS } from './types';

// HowToUse is a presentational, no-props component that renders no <Link>s, so
// it does not require a Router. It renders identically for every role because
// it reads no auth state and exposes no editable controls (Req 3.1).

afterEach(() => {
  cleanup();
});

// Validates: Requirements 3.1, 3.2, 3.3, 3.4
describe('HowToUse (Archetype 1 — read-only)', () => {
  // Req 3.2: the marker legend shows both the Mandatory and Optional markers,
  // sourced from the shared PREREQ_MARKERS constant.
  describe('marker legend', () => {
    it('renders the Mandatory marker label from PREREQ_MARKERS', () => {
      render(<HowToUse />);
      expect(screen.getByText(PREREQ_MARKERS.mandatory.label)).toBeTruthy();
      // Sanity check the fixture matches the expected French copy.
      expect(PREREQ_MARKERS.mandatory.label).toBe('Obligatoire');
    });

    it('renders the Optional marker label from PREREQ_MARKERS', () => {
      render(<HowToUse />);
      expect(screen.getByText(PREREQ_MARKERS.optional.label)).toBeTruthy();
      expect(PREREQ_MARKERS.optional.label).toBe('Optionnel');
    });
  });

  // Req 3.3: completion tips / example guidance are present.
  describe('completion tips', () => {
    it('renders the tips section heading', () => {
      render(<HowToUse />);
      expect(
        screen.getByText('Conseils pour compléter les prérequis'),
      ).toBeTruthy();
    });

    it('mentions starting with the Basics page', () => {
      render(<HowToUse />);
      // A known tip references the "Basics" page.
      expect(screen.getByText(/Basics/)).toBeTruthy();
    });

    it('mentions the "Réponse client" column for mandatory questions', () => {
      render(<HowToUse />);
      expect(screen.getByText(/Réponse client/)).toBeTruthy();
    });
  });

  // Req 3.4: a visually distinct secrets warning is present.
  describe('secrets warning', () => {
    it('warns against entering secrets / PSK / credentials', () => {
      render(<HowToUse />);
      expect(
        screen.getByText(/secrets, de clés PSK ou d’identifiants/),
      ).toBeTruthy();
    });

    it('instructs the user to use a secure channel', () => {
      render(<HowToUse />);
      expect(screen.getByText(/canal sécurisé/)).toBeTruthy();
    });

    it('renders the warning with an alert role for prominence', () => {
      render(<HowToUse />);
      expect(screen.getByRole('alert')).toBeTruthy();
    });
  });

  // Req 3.1: the component is fully static / read-only for every role — no
  // editable or interactive controls of any kind should render.
  describe('read-only for every role', () => {
    it('renders no textbox controls', () => {
      render(<HowToUse />);
      expect(screen.queryAllByRole('textbox')).toHaveLength(0);
    });

    it('renders no combobox controls', () => {
      render(<HowToUse />);
      expect(screen.queryAllByRole('combobox')).toHaveLength(0);
    });

    it('renders no button controls', () => {
      render(<HowToUse />);
      expect(screen.queryAllByRole('button')).toHaveLength(0);
    });

    it('renders no checkbox controls', () => {
      render(<HowToUse />);
      expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    });
  });
});

import { render, screen } from '@testing-library/react';
import { createRoutesStub } from 'react-router';
import { describe, expect, it } from 'vitest';
import Home from '../home';
import { TOUR, VIEWS } from '../../data/overview';

function renderHome() {
  const Stub = createRoutesStub([{ path: '/', Component: Home }]);
  render(<Stub initialEntries={['/']} />);
}

describe('Home overview landing', () => {
  it('leads with the hook headline', () => {
    renderHome();
    expect(
      screen.getByRole('heading', { name: /vive en tu cabeza y en el WhatsApp/i }),
    ).toBeInTheDocument();
  });

  it('renders each suggested-tour step linking to its view', () => {
    renderHome();
    for (const step of TOUR) {
      const links = screen.getAllByRole('link', { name: new RegExp(step.label, 'i') });
      expect(links.some((l) => l.getAttribute('href') === step.path)).toBe(true);
    }
  });

  it('lists every view with a link to its route', () => {
    renderHome();
    for (const view of VIEWS) {
      const links = screen.getAllByRole('link', { name: new RegExp(view.label, 'i') });
      expect(links.some((l) => l.getAttribute('href') === view.path)).toBe(true);
    }
  });

  it('does not use the banned "cabina de mando" wording', () => {
    renderHome();
    expect(screen.queryByText(/cabina de mando/i)).not.toBeInTheDocument();
  });
});

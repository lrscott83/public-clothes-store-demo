import { fireEvent, render, screen, within } from '@testing-library/react';
import { createRoutesStub } from 'react-router';
import { describe, it, expect } from 'vitest';
import { Sidebar } from '../sidebar';

describe('Sidebar', () => {
  it('renders exactly 7 nav links, one per screen', () => {
    const Stub = createRoutesStub([{ path: '/', Component: Sidebar }]);
    render(<Stub initialEntries={['/']} />);

    const nav = screen.getByRole('navigation');
    const links = within(nav).getAllByRole('link');

    expect(links).toHaveLength(7);
  });

  it('marks the link matching the current route as active', () => {
    const Stub = createRoutesStub([{ path: '/tasas', Component: Sidebar }]);
    render(<Stub initialEntries={['/tasas']} />);

    const activeLink = screen.getByRole('link', { name: /tasas/i });
    expect(activeLink).toHaveAttribute('aria-current', 'page');
  });

  it('opens and closes the mobile menu via the top-bar toggle', () => {
    const Stub = createRoutesStub([{ path: '/', Component: Sidebar }]);
    render(<Stub initialEntries={['/']} />);

    // Closed: only the desktop nav landmark is present.
    const toggle = screen.getByRole('button', { name: /abrir menú/i });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getAllByRole('navigation')).toHaveLength(1);

    // Open: the mobile dropdown nav appears alongside the desktop one.
    fireEvent.click(toggle);
    const openToggle = screen.getByRole('button', { name: /cerrar menú/i });
    expect(openToggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getAllByRole('navigation')).toHaveLength(2);

    // Close again.
    fireEvent.click(openToggle);
    expect(screen.getByRole('button', { name: /abrir menú/i })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(screen.getAllByRole('navigation')).toHaveLength(1);
  });
});

import { render, screen, within } from '@testing-library/react';
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
});

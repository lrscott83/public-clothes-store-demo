import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { Header } from '../header';
import { buildStoreConfig } from './test-fixtures';

describe('Header', () => {
  it('renders the brand name and a route nav link from config', () => {
    const config = buildStoreConfig({
      brand: { name: 'Acme Storefront', copyright: '© Acme' },
      nav: [{ label: 'Shop', path: '/productos', kind: 'route' }],
    });

    render(
      <MemoryRouter>
        <Header config={config} />
      </MemoryRouter>,
    );

    expect(screen.getByText('Acme Storefront')).toBeInTheDocument();
    const shopLink = screen.getByRole('link', { name: 'Shop' });
    expect(shopLink).toHaveAttribute('href', '/productos');
  });

  it('renders a different brand name and an anchor nav link for a second config', () => {
    const config = buildStoreConfig({
      brand: { name: 'Second Brand', copyright: '© Second' },
      nav: [{ label: 'Offers', path: '#ofertas', kind: 'anchor' }],
    });

    render(
      <MemoryRouter>
        <Header config={config} />
      </MemoryRouter>,
    );

    expect(screen.getByText('Second Brand')).toBeInTheDocument();
    expect(screen.queryByText('Acme Storefront')).not.toBeInTheDocument();
    const offersLink = screen.getByRole('link', { name: 'Offers' });
    expect(offersLink).toHaveAttribute('href', '#ofertas');
  });

  it('renders a logo image when config.logo.image is set instead of the icon fallback', () => {
    const config = buildStoreConfig({
      logo: { image: '/fixture-logo.png', alt: 'Fixture logo' },
    });

    render(
      <MemoryRouter>
        <Header config={config} />
      </MemoryRouter>,
    );

    const logoImg = screen.getByRole('img', { name: 'Fixture logo' });
    expect(logoImg).toHaveAttribute('src', '/fixture-logo.png');
  });

  it('toggles a collapsible mobile menu open and closed via the menu button', async () => {
    const user = userEvent.setup();
    const config = buildStoreConfig({
      nav: [{ label: 'Productos', path: '/productos', kind: 'route' }],
    });

    render(
      <MemoryRouter>
        <Header config={config} />
      </MemoryRouter>,
    );

    const toggle = screen.getByRole('button', { name: 'Toggle navigation menu' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    // Closed: only the desktop nav copy of the link is in the DOM.
    expect(screen.getAllByRole('link', { name: 'Productos' })).toHaveLength(1);

    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    // Open: desktop + mobile copies are both present.
    expect(screen.getAllByRole('link', { name: 'Productos' })).toHaveLength(2);

    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getAllByRole('link', { name: 'Productos' })).toHaveLength(1);
  });
});

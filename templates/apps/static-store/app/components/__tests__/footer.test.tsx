import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { Footer } from '../footer';
import { buildStoreConfig } from './test-fixtures';

describe('Footer', () => {
  it('renders the copyright and link groups from config', () => {
    const config = buildStoreConfig({
      footer: {
        copyright: '© Acme Storefront',
        linkGroups: [
          {
            title: 'Shop',
            links: [{ label: 'Products', path: '/productos', kind: 'route' }],
          },
        ],
      },
    });

    render(
      <MemoryRouter>
        <Footer config={config} />
      </MemoryRouter>,
    );

    expect(screen.getByText('© Acme Storefront')).toBeInTheDocument();
    expect(screen.getByText('Shop')).toBeInTheDocument();
    const productsLink = screen.getByRole('link', { name: 'Products' });
    expect(productsLink).toHaveAttribute('href', '/productos');
  });

  it('renders a different copyright/link set for a second config', () => {
    const config = buildStoreConfig({
      footer: {
        copyright: '© Second Storefront',
        linkGroups: [
          {
            title: 'Help',
            links: [{ label: 'FAQ', path: '#faq', kind: 'anchor' }],
          },
        ],
      },
    });

    render(
      <MemoryRouter>
        <Footer config={config} />
      </MemoryRouter>,
    );

    expect(screen.getByText('© Second Storefront')).toBeInTheDocument();
    expect(screen.queryByText('© Acme Storefront')).not.toBeInTheDocument();
    expect(screen.getByText('Help')).toBeInTheDocument();
    const faqLink = screen.getByRole('link', { name: 'FAQ' });
    expect(faqLink).toHaveAttribute('href', '#faq');
  });

  it('degrades gracefully when linkGroups/contact/social are omitted', () => {
    const config = buildStoreConfig({
      footer: { copyright: '© Minimal Storefront' },
    });

    render(
      <MemoryRouter>
        <Footer config={config} />
      </MemoryRouter>,
    );

    expect(screen.getByText('© Minimal Storefront')).toBeInTheDocument();
    expect(screen.queryByText('undefined')).not.toBeInTheDocument();
    expect(screen.queryAllByRole('link')).toHaveLength(0);
  });

  it('renders contact info and social links when provided', () => {
    const config = buildStoreConfig({
      footer: {
        copyright: '© Contact Storefront',
        contact: 'hello@example.com',
        social: [{ label: 'Instagram', url: 'https://instagram.com/example' }],
      },
    });

    render(
      <MemoryRouter>
        <Footer config={config} />
      </MemoryRouter>,
    );

    expect(screen.getByText('hello@example.com')).toBeInTheDocument();
    const socialLink = screen.getByRole('link', { name: 'Instagram' });
    expect(socialLink).toHaveAttribute('href', 'https://instagram.com/example');
  });
});

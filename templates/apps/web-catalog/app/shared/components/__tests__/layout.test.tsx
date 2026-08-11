import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { Header } from '../header';
import { Footer } from '../footer';
import { Hero } from '../hero';
import { defaultStoreConfig } from '../../config/stores/default.config';

/**
 * Approval tests for already-written config-driven chrome (Header/Footer/
 * Hero) — same "already-correct code" category as `api-public`'s
 * `image-url.spec.ts` precedent (apply-progress.md, Phase 4). These
 * components render `StoreConfig` fields verbatim; no branching worth a
 * RED-first cycle beyond what `store-config.server.test.ts` already covers
 * for the config resolution itself.
 */
describe('Header', () => {
  it('renders the brand name and every nav item as a link', () => {
    render(
      <MemoryRouter>
        <Header config={defaultStoreConfig} />
      </MemoryRouter>,
    );

    expect(screen.getByText(defaultStoreConfig.brand.name)).toBeInTheDocument();
    for (const item of defaultStoreConfig.nav) {
      expect(screen.getByRole('link', { name: item.label })).toHaveAttribute('href', item.path);
    }
  });
});

describe('Footer', () => {
  it('renders the copyright and link group titles', () => {
    render(
      <MemoryRouter>
        <Footer config={defaultStoreConfig} />
      </MemoryRouter>,
    );

    expect(screen.getByText(defaultStoreConfig.footer.copyright)).toBeInTheDocument();
    expect(screen.getByText('Tienda')).toBeInTheDocument();
  });
});

describe('Hero', () => {
  it('renders the heading, subheading and CTA', () => {
    render(
      <MemoryRouter>
        <Hero config={defaultStoreConfig} />
      </MemoryRouter>,
    );

    expect(screen.getByText(defaultStoreConfig.hero.heading)).toBeInTheDocument();
    expect(screen.getByText(defaultStoreConfig.hero.subheading)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Ver productos/ })).toHaveAttribute('href', '/productos');
  });

  it('does not render a hero image when the config omits one', () => {
    render(
      <MemoryRouter>
        <Hero config={defaultStoreConfig} />
      </MemoryRouter>,
    );

    expect(screen.queryByTestId('hero-image')).not.toBeInTheDocument();
  });
});

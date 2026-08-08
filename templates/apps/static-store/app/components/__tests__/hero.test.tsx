import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { Hero } from '../hero';
import { buildStoreConfig } from './test-fixtures';

describe('Hero', () => {
  it('renders the image, heading, subheading and CTA from config', () => {
    const config = buildStoreConfig({
      hero: {
        image: '/verticals/clothes/hero.jpg',
        heading: 'Discover exclusive products',
        subheading: 'Exceptional quality for your lifestyle',
        ctaLabel: 'Shop now',
        ctaPath: '/productos',
      },
    });

    render(
      <MemoryRouter>
        <Hero config={config} />
      </MemoryRouter>,
    );

    // Regression: image comes from config, never a hardcoded literal like 'hero5.jpg'.
    expect(screen.getByTestId('hero-image')).toHaveAttribute('src', '/verticals/clothes/hero.jpg');
    expect(screen.getByRole('heading', { name: 'Discover exclusive products' })).toBeInTheDocument();
    expect(screen.getByText('Exceptional quality for your lifestyle')).toBeInTheDocument();
    const cta = screen.getByRole('link', { name: 'Shop now' });
    expect(cta).toHaveAttribute('href', '/productos');
  });

  it('renders without a CTA when ctaLabel/ctaPath are omitted', () => {
    const config = buildStoreConfig({
      hero: {
        image: '/verticals/demo/hero.jpg',
        heading: 'Demo heading',
        subheading: 'Demo subheading',
      },
    });

    render(
      <MemoryRouter>
        <Hero config={config} />
      </MemoryRouter>,
    );

    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('applies a documented default overlay when hero.overlayColor/overlayOpacity are omitted', () => {
    const config = buildStoreConfig({
      hero: {
        image: '/verticals/demo/hero.jpg',
        heading: 'Demo heading',
        subheading: 'Demo subheading',
      },
    });

    render(
      <MemoryRouter>
        <Hero config={config} />
      </MemoryRouter>,
    );

    const overlay = screen.getByTestId('hero-overlay');
    expect(overlay).toHaveStyle({ backgroundColor: 'rgb(0, 0, 0)', opacity: '0.5' });
  });

  it('applies a custom overlay color/opacity from config when provided', () => {
    const config = buildStoreConfig({
      hero: {
        image: '/verticals/demo/hero.jpg',
        heading: 'Demo heading',
        subheading: 'Demo subheading',
        overlayColor: 'rgb(103 58 183)',
        overlayOpacity: 0.3,
      },
    });

    render(
      <MemoryRouter>
        <Hero config={config} />
      </MemoryRouter>,
    );

    const overlay = screen.getByTestId('hero-overlay');
    expect(overlay).toHaveStyle({ backgroundColor: 'rgb(103, 58, 183)', opacity: '0.3' });
  });
});

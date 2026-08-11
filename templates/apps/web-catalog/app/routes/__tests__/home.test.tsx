import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { HomePage } from '../home';
import { defaultStoreConfig } from '../../shared/config/stores/default.config';

describe('HomePage', () => {
  it('renders the Hero with the resolved store config', () => {
    render(
      <MemoryRouter>
        <HomePage config={defaultStoreConfig} />
      </MemoryRouter>,
    );

    expect(screen.getByText(defaultStoreConfig.hero.heading)).toBeInTheDocument();
  });
});

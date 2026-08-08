import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import Tasas from '../tasas';
import { loadSeedState } from '../../store/seed-store';

describe('Tasas container', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders the heading and the three current rates as editable fields', () => {
    loadSeedState();
    render(<Tasas />);

    expect(screen.getByRole('heading', { name: /tasas de cambio/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/usd.*mn/i)).toHaveValue(680);
    expect(screen.getByLabelText(/zelle/i)).toHaveValue(1);
    expect(screen.getByLabelText(/eur/i)).toHaveValue(1);
  });

  it('editing a field and saving persists the new value and shows confirmation', () => {
    loadSeedState();
    render(<Tasas />);

    fireEvent.change(screen.getByLabelText(/usd.*mn/i), { target: { value: '700' } });
    fireEvent.click(screen.getByRole('button', { name: /guardar/i }));

    expect(loadSeedState().exchangeRates.usdToMn).toBe(700);
    expect(screen.getByText(/tasas guardadas/i)).toBeInTheDocument();
  });

  it('blocks save on an invalid field and leaves persisted rates unchanged', () => {
    loadSeedState();
    render(<Tasas />);

    fireEvent.change(screen.getByLabelText(/zelle/i), { target: { value: '0' } });
    const saveButton = screen.getByRole('button', { name: /guardar/i });
    expect(saveButton).toBeDisabled();

    fireEvent.click(saveButton);

    expect(loadSeedState().exchangeRates).toEqual({ usdToMn: 680, zelle: 1, eur: 1 });
  });
});

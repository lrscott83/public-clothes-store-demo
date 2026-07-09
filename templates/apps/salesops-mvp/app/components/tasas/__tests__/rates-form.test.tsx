import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { RatesForm, type RatesFormDraft } from '../rates-form';

function buildDraft(overrides: Partial<RatesFormDraft> = {}): RatesFormDraft {
  return {
    usdToMn: '680',
    zelle: '1',
    eur: '1',
    ...overrides,
  };
}

describe('RatesForm', () => {
  it('renders three numeric inputs seeded from draft with the expected labels', () => {
    render(<RatesForm draft={buildDraft()} onChange={vi.fn()} onSave={vi.fn()} />);

    expect(screen.getByLabelText(/usd.*mn/i)).toHaveValue(680);
    expect(screen.getByLabelText(/zelle/i)).toHaveValue(1);
    expect(screen.getByLabelText(/eur/i)).toHaveValue(1);
  });

  it('typing in a field calls onChange with the updated draft', () => {
    const onChange = vi.fn();
    const draft = buildDraft();
    render(<RatesForm draft={draft} onChange={onChange} onSave={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/usd.*mn/i), { target: { value: '700' } });

    expect(onChange).toHaveBeenCalledWith({ ...draft, usdToMn: '700' });
  });

  it.each(['', '0', '-5', 'abc'])(
    'blocks save and shows an inline error when a field is invalid (%s)',
    (invalidValue) => {
      const onSave = vi.fn();
      render(<RatesForm draft={buildDraft({ zelle: invalidValue })} onChange={vi.fn()} onSave={onSave} />);

      const saveButton = screen.getByRole('button', { name: /guardar/i });
      expect(saveButton).toBeDisabled();
      expect(screen.getByText(/requerido|mayor a 0|debe ser/i)).toBeInTheDocument();

      fireEvent.click(saveButton);
      expect(onSave).not.toHaveBeenCalled();
    },
  );

  it('enables Save and calls onSave exactly once when all fields are valid', () => {
    const onSave = vi.fn();
    render(<RatesForm draft={buildDraft()} onChange={vi.fn()} onSave={onSave} />);

    const saveButton = screen.getByRole('button', { name: /guardar/i });
    expect(saveButton).toBeEnabled();
    fireEvent.click(saveButton);

    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('renders a confirmation message when saved is true', () => {
    render(<RatesForm draft={buildDraft()} onChange={vi.fn()} onSave={vi.fn()} saved />);

    expect(screen.getByText(/tasas guardadas/i)).toBeInTheDocument();
  });
});

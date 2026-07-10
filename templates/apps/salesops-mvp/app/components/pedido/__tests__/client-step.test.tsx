import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ClientStep, type ClientStepDraft } from '../client-step';

function buildDraft(overrides: Partial<ClientStepDraft> = {}): ClientStepDraft {
  return {
    name: '',
    phone: '',
    address: '',
    deliveryMode: 'domicilio',
    method: 'efectivo',
    needsChange: false,
    observations: '',
    ...overrides,
  };
}

describe('ClientStep', () => {
  it('shows the address field when deliveryMode is domicilio', () => {
    render(<ClientStep draft={buildDraft()} onChange={vi.fn()} />);

    expect(screen.getByLabelText(/dirección/i)).toBeInTheDocument();
  });

  it('hides the address field when deliveryMode is recogida', () => {
    render(
      <ClientStep
        draft={buildDraft({ deliveryMode: 'recogida' })}
        onChange={vi.fn()}
      />,
    );

    expect(screen.queryByLabelText(/dirección/i)).not.toBeInTheDocument();
  });

  it('typing in the name field calls onChange with the updated draft', () => {
    const onChange = vi.fn();
    const draft = buildDraft();
    render(<ClientStep draft={draft} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText(/nombre/i), { target: { value: 'Ana' } });

    expect(onChange).toHaveBeenCalledWith({ ...draft, name: 'Ana' });
  });

  it('selecting "Recogida" calls onChange with deliveryMode "recogida"', () => {
    const onChange = vi.fn();
    const draft = buildDraft();
    render(<ClientStep draft={draft} onChange={onChange} />);

    fireEvent.click(screen.getByRole('radio', { name: /recogida/i }));

    expect(onChange).toHaveBeenCalledWith({ ...draft, deliveryMode: 'recogida' });
  });
});

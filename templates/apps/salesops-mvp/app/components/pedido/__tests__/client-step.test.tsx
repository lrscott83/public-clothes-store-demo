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
    render(<ClientStep draft={buildDraft()} onChange={vi.fn()} onNext={vi.fn()} onBack={vi.fn()} />);

    expect(screen.getByLabelText(/dirección/i)).toBeInTheDocument();
  });

  it('hides the address field when deliveryMode is recogida', () => {
    render(
      <ClientStep
        draft={buildDraft({ deliveryMode: 'recogida' })}
        onChange={vi.fn()}
        onNext={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    expect(screen.queryByLabelText(/dirección/i)).not.toBeInTheDocument();
  });

  it('disables "Siguiente" when name is empty', () => {
    render(
      <ClientStep
        draft={buildDraft({ phone: '555-1234', address: 'Calle 1' })}
        onChange={vi.fn()}
        onNext={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: /siguiente/i })).toBeDisabled();
  });

  it('disables "Siguiente" when phone is empty', () => {
    render(
      <ClientStep
        draft={buildDraft({ name: 'Ana', address: 'Calle 1' })}
        onChange={vi.fn()}
        onNext={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: /siguiente/i })).toBeDisabled();
  });

  it('disables "Siguiente" in domicilio mode when address is empty', () => {
    render(
      <ClientStep
        draft={buildDraft({ name: 'Ana', phone: '555-1234' })}
        onChange={vi.fn()}
        onNext={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: /siguiente/i })).toBeDisabled();
  });

  it('enables "Siguiente" and calls onNext in domicilio mode once name, phone, and address are filled', () => {
    const onNext = vi.fn();
    render(
      <ClientStep
        draft={buildDraft({ name: 'Ana', phone: '555-1234', address: 'Calle 1' })}
        onChange={vi.fn()}
        onNext={onNext}
        onBack={vi.fn()}
      />,
    );

    const next = screen.getByRole('button', { name: /siguiente/i });
    expect(next).toBeEnabled();
    fireEvent.click(next);
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it('enables "Siguiente" in recogida mode without an address', () => {
    render(
      <ClientStep
        draft={buildDraft({ name: 'Ana', phone: '555-1234', deliveryMode: 'recogida' })}
        onChange={vi.fn()}
        onNext={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: /siguiente/i })).toBeEnabled();
  });

  it('calls onBack when "Atrás" is clicked', () => {
    const onBack = vi.fn();
    render(<ClientStep draft={buildDraft()} onChange={vi.fn()} onNext={vi.fn()} onBack={onBack} />);

    fireEvent.click(screen.getByRole('button', { name: /atrás/i }));

    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('typing in the name field calls onChange with the updated draft', () => {
    const onChange = vi.fn();
    const draft = buildDraft();
    render(<ClientStep draft={draft} onChange={onChange} onNext={vi.fn()} onBack={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/nombre/i), { target: { value: 'Ana' } });

    expect(onChange).toHaveBeenCalledWith({ ...draft, name: 'Ana' });
  });

  it('selecting "Recogida" calls onChange with deliveryMode "recogida"', () => {
    const onChange = vi.fn();
    const draft = buildDraft();
    render(<ClientStep draft={draft} onChange={onChange} onNext={vi.fn()} onBack={vi.fn()} />);

    fireEvent.click(screen.getByRole('radio', { name: /recogida/i }));

    expect(onChange).toHaveBeenCalledWith({ ...draft, deliveryMode: 'recogida' });
  });
});

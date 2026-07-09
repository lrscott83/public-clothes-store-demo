import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TransportistaPicker } from '../transportista-picker';
import type { Order, Transportista } from '../../../domain/types';

function buildOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: 'order-1',
    items: [],
    client: { id: 'client-1', name: 'Ana Pérez' },
    payment: { method: 'efectivo' },
    warehouseId: 'wh-1',
    gestorId: 'gestor-1',
    state: 'verificado',
    totalUSD: 150,
    createdAt: '2026-07-09T12:00:00.000Z',
    ...overrides,
  };
}

const transportistas: Transportista[] = [
  { id: 'transportista-1', name: 'Ernesto Junco', phone: '+53 5678 1234', zona: 'Nave Central' },
  { id: 'transportista-2', name: 'Yailin Pupo' },
];

describe('TransportistaPicker', () => {
  it('lists each carrier by name, and shows phone/zona when present', () => {
    render(
      <TransportistaPicker
        order={buildOrder()}
        transportistas={transportistas}
        selectedTransportistaId={null}
        onSelect={vi.fn()}
        onConfirm={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    expect(screen.getByText('Ernesto Junco')).toBeInTheDocument();
    expect(screen.getByText(/\+53 5678 1234/)).toBeInTheDocument();
    expect(screen.getByText(/Nave Central/)).toBeInTheDocument();
    expect(screen.getByText('Yailin Pupo')).toBeInTheDocument();
  });

  it('renders a radio fieldset, not a <select>', () => {
    const { container } = render(
      <TransportistaPicker
        order={buildOrder()}
        transportistas={transportistas}
        selectedTransportistaId={null}
        onSelect={vi.fn()}
        onConfirm={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    expect(container.querySelector('select')).toBeNull();
    expect(container.querySelectorAll('input[type="radio"]')).toHaveLength(2);
  });

  it('disables "Confirmar" until a carrier is selected', () => {
    render(
      <TransportistaPicker
        order={buildOrder()}
        transportistas={transportistas}
        selectedTransportistaId={null}
        onSelect={vi.fn()}
        onConfirm={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: /confirmar/i })).toBeDisabled();
  });

  it('enables "Confirmar" once a carrier is selected and fires onConfirm on click', () => {
    const onConfirm = vi.fn();
    render(
      <TransportistaPicker
        order={buildOrder()}
        transportistas={transportistas}
        selectedTransportistaId="transportista-1"
        onSelect={vi.fn()}
        onConfirm={onConfirm}
        onBack={vi.fn()}
      />,
    );

    const confirmButton = screen.getByRole('button', { name: /confirmar/i });
    expect(confirmButton).not.toBeDisabled();

    fireEvent.click(confirmButton);
    expect(onConfirm).toHaveBeenCalled();
  });

  it('fires onSelect with the clicked carrier id', () => {
    const onSelect = vi.fn();
    render(
      <TransportistaPicker
        order={buildOrder()}
        transportistas={transportistas}
        selectedTransportistaId={null}
        onSelect={onSelect}
        onConfirm={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByLabelText(/ernesto junco/i));

    expect(onSelect).toHaveBeenCalledWith('transportista-1');
  });

  it('fires onBack when "Atrás" is clicked', () => {
    const onBack = vi.fn();
    render(
      <TransportistaPicker
        order={buildOrder()}
        transportistas={transportistas}
        selectedTransportistaId={null}
        onSelect={vi.fn()}
        onConfirm={vi.fn()}
        onBack={onBack}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /atrás/i }));

    expect(onBack).toHaveBeenCalled();
  });
});

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { WarehouseSelector } from '../warehouse-selector';
import type { Warehouse } from '../../../domain/types';

const warehouses: Warehouse[] = [
  { id: 'wh-1', name: 'Nave Central' },
  { id: 'wh-2', name: 'Sucursal Este' },
  { id: 'wh-3', name: 'Sucursal Oeste' },
];

describe('WarehouseSelector', () => {
  it('lists each warehouse by name in a radio fieldset, not a <select>', () => {
    const { container } = render(
      <WarehouseSelector warehouses={warehouses} selectedWarehouseId="wh-1" onSelect={vi.fn()} />,
    );

    expect(screen.getByText('Nave Central')).toBeInTheDocument();
    expect(screen.getByText('Sucursal Este')).toBeInTheDocument();
    expect(screen.getByText('Sucursal Oeste')).toBeInTheDocument();
    expect(container.querySelector('select')).toBeNull();
    expect(container.querySelectorAll('input[type="radio"]')).toHaveLength(3);
  });

  it('marks the selected warehouse radio as checked', () => {
    render(<WarehouseSelector warehouses={warehouses} selectedWarehouseId="wh-2" onSelect={vi.fn()} />);

    expect(screen.getByLabelText(/sucursal este/i)).toBeChecked();
    expect(screen.getByLabelText(/nave central/i)).not.toBeChecked();
  });

  it('fires onSelect with the clicked warehouse id', () => {
    const onSelect = vi.fn();
    render(<WarehouseSelector warehouses={warehouses} selectedWarehouseId="wh-1" onSelect={onSelect} />);

    fireEvent.click(screen.getByLabelText(/sucursal oeste/i));

    expect(onSelect).toHaveBeenCalledWith('wh-3');
  });
});

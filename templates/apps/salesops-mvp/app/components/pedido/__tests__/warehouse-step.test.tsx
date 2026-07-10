import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { WarehouseStep } from '../warehouse-step';
import type { Warehouse } from '../../../domain/types';

const warehouses: Warehouse[] = [
  { id: 'wh-1', name: 'Nave Central' },
  { id: 'wh-2', name: 'Sucursal Este' },
];

describe('WarehouseStep', () => {
  it('renders eligible warehouses as selectable radios', () => {
    render(
      <WarehouseStep
        eligible={warehouses}
        warehouseId={null}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByRole('radio', { name: /nave central/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /sucursal este/i })).toBeInTheDocument();
  });

  it('selecting a warehouse calls onSelect with its id', () => {
    const onSelect = vi.fn();
    render(
      <WarehouseStep
        eligible={warehouses}
        warehouseId={null}
        onSelect={onSelect}
      />,
    );

    fireEvent.click(screen.getByRole('radio', { name: /nave central/i }));

    expect(onSelect).toHaveBeenCalledWith('wh-1');
  });

  it('shows a block message when zero warehouses are eligible', () => {
    render(
      <WarehouseStep eligible={[]} warehouseId={null} onSelect={vi.fn()} />,
    );

    expect(screen.getByText(/ningún almacén/i)).toBeInTheDocument();
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
  });
});

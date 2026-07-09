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
        onConfirm={vi.fn()}
        onBack={vi.fn()}
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
        onConfirm={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole('radio', { name: /nave central/i }));

    expect(onSelect).toHaveBeenCalledWith('wh-1');
  });

  it('disables "Confirmar" until a warehouse is selected', () => {
    render(
      <WarehouseStep
        eligible={warehouses}
        warehouseId={null}
        onSelect={vi.fn()}
        onConfirm={vi.fn()}
        onBack={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: /confirmar/i })).toBeDisabled();
  });

  it('enables "Confirmar" and calls onConfirm once a warehouse is selected', () => {
    const onConfirm = vi.fn();
    render(
      <WarehouseStep
        eligible={warehouses}
        warehouseId="wh-1"
        onSelect={vi.fn()}
        onConfirm={onConfirm}
        onBack={vi.fn()}
      />,
    );

    const confirm = screen.getByRole('button', { name: /confirmar/i });
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('shows a block message and disables "Confirmar" when zero warehouses are eligible', () => {
    render(
      <WarehouseStep eligible={[]} warehouseId={null} onSelect={vi.fn()} onConfirm={vi.fn()} onBack={vi.fn()} />,
    );

    expect(screen.getByRole('button', { name: /confirmar/i })).toBeDisabled();
    expect(screen.getByText(/ningún almacén/i)).toBeInTheDocument();
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();
  });

  it('calls onBack when "Atrás" is clicked', () => {
    const onBack = vi.fn();
    render(
      <WarehouseStep
        eligible={warehouses}
        warehouseId={null}
        onSelect={vi.fn()}
        onConfirm={vi.fn()}
        onBack={onBack}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /atrás/i }));

    expect(onBack).toHaveBeenCalledTimes(1);
  });
});

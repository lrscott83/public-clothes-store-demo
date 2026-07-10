import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { WarehouseSelector } from '../warehouse-selector';
import type { Warehouse } from '../../../domain/types';

const warehouses: Warehouse[] = [
  { id: 'wh-1', name: 'Pinar del Río' },
  { id: 'wh-2', name: 'Consolación del Sur' },
  { id: 'wh-3', name: 'Herradura' },
];

describe('WarehouseSelector', () => {
  it('lists each warehouse as a segmented button, not radios or a <select>', () => {
    const { container } = render(
      <WarehouseSelector warehouses={warehouses} selectedWarehouseId="wh-1" onSelect={vi.fn()} />,
    );

    expect(screen.getByRole('button', { name: 'Pinar del Río' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Consolación del Sur' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Herradura' })).toBeInTheDocument();
    expect(container.querySelector('select')).toBeNull();
    expect(container.querySelectorAll('input[type="radio"]')).toHaveLength(0);
    expect(container.querySelectorAll('button')).toHaveLength(3);
  });

  it('marks the selected warehouse button as pressed', () => {
    render(<WarehouseSelector warehouses={warehouses} selectedWarehouseId="wh-2" onSelect={vi.fn()} />);

    expect(screen.getByRole('button', { name: /consolación/i })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /pinar del río/i })).toHaveAttribute('aria-pressed', 'false');
  });

  it('fires onSelect with the clicked warehouse id', () => {
    const onSelect = vi.fn();
    render(<WarehouseSelector warehouses={warehouses} selectedWarehouseId="wh-1" onSelect={onSelect} />);

    fireEvent.click(screen.getByRole('button', { name: /herradura/i }));

    expect(onSelect).toHaveBeenCalledWith('wh-3');
  });
});

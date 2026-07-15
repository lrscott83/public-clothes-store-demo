import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PeriodFilter } from '../period-filter';

describe('PeriodFilter', () => {
  it('renders both the 7d and 30d options', () => {
    render(<PeriodFilter value={7} onChange={vi.fn()} />);

    expect(screen.getByText('7d')).toBeInTheDocument();
    expect(screen.getByText('30d')).toBeInTheDocument();
  });

  it('calls onChange with 30 when 30d is clicked', () => {
    const onChange = vi.fn();
    render(<PeriodFilter value={7} onChange={onChange} />);

    fireEvent.click(screen.getByText('30d'));

    expect(onChange).toHaveBeenCalledWith(30);
  });

  it('calls onChange with 7 when 7d is clicked', () => {
    const onChange = vi.fn();
    render(<PeriodFilter value={30} onChange={onChange} />);

    fireEvent.click(screen.getByText('7d'));

    expect(onChange).toHaveBeenCalledWith(7);
  });

  it('marks the current value as pressed', () => {
    render(<PeriodFilter value={7} onChange={vi.fn()} />);

    expect(screen.getByText('7d')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('30d')).toHaveAttribute('aria-pressed', 'false');
  });
});

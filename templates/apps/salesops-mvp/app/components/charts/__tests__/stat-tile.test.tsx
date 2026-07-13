import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatTile } from '../stat-tile';

describe('StatTile', () => {
  it('renders the label and the (already formatted) value text', () => {
    render(<StatTile label="Ventas" value="$800.00" />);

    expect(screen.getByText('Ventas')).toBeInTheDocument();
    expect(screen.getByText('$800.00')).toBeInTheDocument();
  });

  it('shows an up arrow with a green (success) class when delta > 0 and positiveIsGood is true', () => {
    render(<StatTile label="Ventas" value="$800.00" delta={0.25} positiveIsGood />);

    const arrow = screen.getByText('▲');
    expect(arrow).toBeInTheDocument();
    expect(arrow.className).toContain('text-success');
  });

  it('shows an up arrow with a red (danger) class when delta > 0 and positiveIsGood is false', () => {
    render(<StatTile label="Comisión pendiente" value="3000 MN" delta={0.5} positiveIsGood={false} />);

    const arrow = screen.getByText('▲');
    expect(arrow).toBeInTheDocument();
    expect(arrow.className).toContain('text-danger');
  });

  it('shows a down arrow with a red (danger) class when delta < 0 and positiveIsGood is true', () => {
    render(<StatTile label="Ventas" value="$400.00" delta={-0.1} positiveIsGood />);

    const arrow = screen.getByText('▼');
    expect(arrow).toBeInTheDocument();
    expect(arrow.className).toContain('text-danger');
  });

  it('renders no arrow and a neutral "—" when delta is null', () => {
    render(<StatTile label="AOV" value="$400.00" delta={null} positiveIsGood />);

    expect(screen.queryByText('▲')).not.toBeInTheDocument();
    expect(screen.queryByText('▼')).not.toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('renders no arrow when delta is undefined (not passed at all)', () => {
    render(<StatTile label="AOV" value="$400.00" />);

    expect(screen.queryByText('▲')).not.toBeInTheDocument();
    expect(screen.queryByText('▼')).not.toBeInTheDocument();
  });

  it('shows an up arrow (from trend) and no percentage when trend is up but delta is null (prior window was 0)', () => {
    render(<StatTile label="Ventas" value="$500.00" trend="up" delta={null} positiveIsGood />);

    const arrow = screen.getByText('▲');
    expect(arrow).toBeInTheDocument();
    expect(arrow.className).toContain('text-success');
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
  });

  it('shows a down arrow (from trend) with no percentage when trend is down but delta is null', () => {
    render(<StatTile label="Ventas" value="$0.00" trend="down" delta={null} positiveIsGood />);

    const arrow = screen.getByText('▼');
    expect(arrow).toBeInTheDocument();
    expect(arrow.className).toContain('text-danger');
  });

  it('prefers the explicit trend for arrow direction while still showing the delta percentage', () => {
    render(<StatTile label="Ventas" value="$500.00" trend="up" delta={0.25} positiveIsGood />);

    expect(screen.getByText('▲')).toBeInTheDocument();
    expect(screen.getByText('25.0%')).toBeInTheDocument();
  });

  it('renders an optional sublabel when provided', () => {
    render(<StatTile label="Pedidos" value="12" sublabel="AOV $400.00" />);

    expect(screen.getByText('AOV $400.00')).toBeInTheDocument();
  });

  it('renders an optional help node next to the label', () => {
    render(<StatTile label="Ventas" value="$800.00" help={<span>ayuda</span>} />);

    expect(screen.getByText('ayuda')).toBeInTheDocument();
  });
});

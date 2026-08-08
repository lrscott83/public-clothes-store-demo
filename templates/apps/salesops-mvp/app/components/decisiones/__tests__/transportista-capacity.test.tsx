import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { TransportistaCapacity } from '../transportista-capacity';
import type { TransportistaCapacityView } from '../../../domain/decisiones-dashboard';

const CAPACITY: TransportistaCapacityView = {
  rows: [
    { transportistaId: 't1', name: 'Julio', ocupado: true, ordersTransportando: 2 },
    { transportistaId: 't2', name: 'Marta', ocupado: false, ordersTransportando: 0 },
  ],
  disponibles: 1,
  transportando: 1,
  sinChofer: 3,
};

describe('TransportistaCapacity', () => {
  it('renders the disponibles, transportando (ocupados), and sin chofer totals', () => {
    render(<TransportistaCapacity capacity={CAPACITY} />);

    expect(screen.getByText(/disponibles/).textContent).toContain('1');
    expect(screen.getByText(/en camino/).textContent).toContain('1');
    expect(screen.getByText(/sin chofer/).textContent).toContain('3');
  });

  it('lists each transportista by name with an Ocupado/Disponible status', () => {
    render(<TransportistaCapacity capacity={CAPACITY} />);

    expect(screen.getByText('Julio')).toBeInTheDocument();
    expect(screen.getByText('Marta')).toBeInTheDocument();
    expect(screen.getByText('Ocupado')).toBeInTheDocument();
    expect(screen.getByText('Disponible')).toBeInTheDocument();
  });

  it('has no "decisiones" in the heading', () => {
    render(<TransportistaCapacity capacity={CAPACITY} />);

    expect(screen.getByText('Transportistas').textContent?.toLowerCase()).not.toContain('decisiones');
  });
});

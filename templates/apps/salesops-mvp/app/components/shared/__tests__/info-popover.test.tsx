import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { InfoPopover } from '../info-popover';

describe('InfoPopover', () => {
  it('renders a help button and keeps the explanation hidden until clicked', () => {
    render(<InfoPopover title="Ventas" text="Cuánto facturaste." />);

    expect(screen.getByRole('button', { name: /ventas/i })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByText('Cuánto facturaste.')).not.toBeInTheDocument();
  });

  it('reveals the title and text in a dialog when the button is clicked', async () => {
    const user = userEvent.setup();
    render(<InfoPopover title="Ventas" text="Cuánto facturaste." />);

    await user.click(screen.getByRole('button', { name: /ventas/i }));

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText('Cuánto facturaste.')).toBeInTheDocument();
  });

  it('toggles closed again on a second click', async () => {
    const user = userEvent.setup();
    render(<InfoPopover title="Ventas" text="Cuánto facturaste." />);
    const button = screen.getByRole('button', { name: /ventas/i });

    await user.click(button);
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await user.click(button);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes when Escape is pressed', async () => {
    const user = userEvent.setup();
    render(<InfoPopover title="Ventas" text="Cuánto facturaste." />);

    await user.click(screen.getByRole('button', { name: /ventas/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes when clicking outside the popover', async () => {
    const user = userEvent.setup();
    render(
      <div>
        <InfoPopover title="Ventas" text="Cuánto facturaste." />
        <button type="button">otro</button>
      </div>,
    );

    await user.click(screen.getByRole('button', { name: /ventas/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'otro' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

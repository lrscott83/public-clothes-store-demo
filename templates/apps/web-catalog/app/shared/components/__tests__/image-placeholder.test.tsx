import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ProductImage } from '../image-placeholder';

describe('ProductImage', () => {
  it('renders the image when a src is given', () => {
    render(<ProductImage src="/img/x.webp" alt="Remera" className="h-64" />);

    expect(screen.getByRole('img', { name: 'Remera' })).toHaveAttribute('src', '/img/x.webp');
  });

  it('renders a placeholder with the same className when src is null', () => {
    const { container } = render(<ProductImage src={null} alt="Remera" className="h-64" />);

    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(container.querySelector('svg')).toBeInTheDocument();
    expect(container.firstElementChild).toHaveClass('h-64');
  });

  it('labels the placeholder for assistive tech', () => {
    render(<ProductImage src={null} alt="Remera" className="h-64" />);

    expect(screen.getByLabelText('Remera (sin imagen)')).toBeInTheDocument();
  });

  it('exposes the placeholder as an accessible group, not an img — locks in the fix for the role="img"/queryByRole("img") collision', () => {
    render(<ProductImage src={null} alt="Remera" className="h-64" />);

    expect(screen.getByRole('group', { name: 'Remera (sin imagen)' })).toBeInTheDocument();
  });
});

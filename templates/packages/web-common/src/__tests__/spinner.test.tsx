import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Spinner } from '../client/spinner';
import { LoadingOverlay } from '../client/loading-overlay';
import { Card } from '../client/card';

describe('Spinner', () => {
  it('renders without errors', () => {
    render(<Spinner />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('has accessible label', () => {
    render(<Spinner />);
    expect(screen.getByLabelText('Loading')).toBeInTheDocument();
  });

  it('applies size classes for sm', () => {
    render(<Spinner size="sm" />);
    const el = screen.getByRole('status');
    expect(el.className).toContain('h-4');
  });

  it('applies size classes for lg', () => {
    render(<Spinner size="lg" />);
    const el = screen.getByRole('status');
    expect(el.className).toContain('h-12');
  });

  it('applies custom className', () => {
    render(<Spinner className="my-custom" />);
    expect(screen.getByRole('status').className).toContain('my-custom');
  });
});

describe('LoadingOverlay', () => {
  it('renders with default label', () => {
    render(<LoadingOverlay />);
    expect(screen.getAllByRole('status').length).toBeGreaterThanOrEqual(1);
  });

  it('renders with custom label', () => {
    render(<LoadingOverlay label="Please wait..." />);
    expect(screen.getByText('Please wait...')).toBeInTheDocument();
  });

  it('renders default loading text', () => {
    render(<LoadingOverlay />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });
});

describe('Card', () => {
  it('renders children', () => {
    render(<Card><span>card content</span></Card>);
    expect(screen.getByText('card content')).toBeInTheDocument();
  });

  it('applies padding classes', () => {
    const { container } = render(<Card padding="sm">test</Card>);
    expect(container.firstChild).toHaveClass('p-4');
  });

  it('applies custom className', () => {
    const { container } = render(<Card className="my-card">test</Card>);
    expect(container.firstChild).toHaveClass('my-card');
  });
});

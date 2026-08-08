import { render, screen } from '@testing-library/react';
import { Outlet } from 'react-router';
import { describe, it, expect } from 'vitest';
import type { ReactElement } from 'react';
import App, { ErrorBoundary, Layout } from '../root';
import type { Route } from '../+types/root';

// Layout renders a nested <html>, which real browsers (and jsdom) refuse to
// insert as a child of another element — RTL's render() would silently
// strip/hoist it, making a DOM-level assertion unreliable. Instead we
// shallow-inspect the React element tree Layout returns directly (a React
// function component is just a function), which is deterministic and
// side-steps that DOM limitation. Full HTML output is verified by the
// actual prerender build (see apply-progress verification evidence).
describe('root Layout', () => {
  it('renders an <html> document shell wrapping its children', () => {
    const element = Layout({ children: 'child' }) as ReactElement<Record<string, unknown>>;

    expect(element.type).toBe('html');
    expect(element.props.lang).toBe('en');
  });
});

// App is likewise a plain function component (RR7's default route export) —
// shallow-inspecting its returned element tree avoids the same nested-<html>
// jsdom limitation. The shell (sidebar) lives in the `_shell` layout route,
// not in root App, so root's only job is rendering <Outlet/> without crashing.
describe('root App', () => {
  it('renders an <Outlet/> element (not merely a non-null value)', () => {
    const element = App() as ReactElement;

    // Real runtime assertion: compares the element's type against the actual
    // `Outlet` component reference from react-router, not just a type-only
    // `not.toBeNull()` check — proves App renders the router outlet, not
    // some other truthy element.
    expect(element.type).toBe(Outlet);
  });
});

// ErrorBoundary is RR7's root-level fallback UI. Unlike Layout/App above, it
// renders a plain <main> (no nested <html>), so a real RTL `render()` works
// directly — no need for shallow element inspection.
//
// We deliberately do NOT drive this through `createRoutesStub` with a
// throwing `loader`: that triggers a real client-side navigation via RR7's
// `createClientSideRequest`, which collides with jsdom's `AbortSignal` class
// (`TypeError: RequestInit: Expected signal to be an instance of
// AbortSignal`) — the same environment-level jsdom+undici incompatibility
// already documented for app/routes/__tests__/routes.test.tsx (see
// apply-progress deviation notes). Rendering `ErrorBoundary` directly with a
// constructed `error` prop exercises the exact same branching logic
// (`isRouteErrorResponse`, `instanceof Error`, DEV-only stack) without
// depending on that broken code path.
describe('root ErrorBoundary', () => {
  it('renders a 404 message for a route error response', () => {
    const routeError = { status: 404, statusText: 'Not Found', internal: false, data: undefined };

    render(<ErrorBoundary {...({ error: routeError } as Route.ErrorBoundaryProps)} />);

    expect(screen.getByRole('heading', { name: '404' })).toBeInTheDocument();
    expect(screen.getByText('The requested page could not be found.')).toBeInTheDocument();
  });

  it('renders the status text for a non-404 route error response', () => {
    const routeError = {
      status: 500,
      statusText: 'Internal Server Error',
      internal: false,
      data: undefined,
    };

    render(<ErrorBoundary {...({ error: routeError } as Route.ErrorBoundaryProps)} />);

    expect(screen.getByRole('heading', { name: 'Error' })).toBeInTheDocument();
    expect(screen.getByText('Internal Server Error')).toBeInTheDocument();
  });

  it('renders the error message and stack for a thrown Error in DEV', () => {
    const error = new Error('boom: catalog loader exploded');

    render(<ErrorBoundary {...({ error } as Route.ErrorBoundaryProps)} />);

    expect(screen.getByRole('heading', { name: 'Oops!' })).toBeInTheDocument();
    expect(screen.getByText('boom: catalog loader exploded')).toBeInTheDocument();
    // import.meta.env.DEV is true under vitest, so the stack trace <pre> block
    // should be rendered alongside the message.
    expect(document.querySelector('pre')).not.toBeNull();
  });

  it('falls back to the generic message for a non-Error thrown value', () => {
    render(<ErrorBoundary {...({ error: 'just a string, not an Error instance' } as Route.ErrorBoundaryProps)} />);

    expect(screen.getByRole('heading', { name: 'Oops!' })).toBeInTheDocument();
    expect(screen.getByText('An unexpected error occurred.')).toBeInTheDocument();
    expect(document.querySelector('pre')).toBeNull();
  });
});

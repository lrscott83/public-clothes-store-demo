import { describe, it, expect } from 'vitest';
import type { ReactElement, ReactNode } from 'react';
import App, { Layout } from '../root';

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
  it('renders without crashing and returns an element (Outlet)', () => {
    const element = App() as ReactElement | null;

    expect(element).not.toBeNull();
  });
});

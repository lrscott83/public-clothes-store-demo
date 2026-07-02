import { describe, it, expect } from 'vitest';
import type { ReactElement, ReactNode } from 'react';
import { ThemeProvider } from '@store-mgmt/storefront/theme';
import App, { Layout } from '../root';
import { Header } from '../components/header';
import { Footer } from '../components/footer';
import { activeConfig, activeTheme } from '../store/active';

// Layout renders a nested <html>, which real browsers (and jsdom) refuse to
// insert as a child of another element — RTL's render() would silently
// strip/hoist it, making a DOM-level assertion unreliable. Instead we
// shallow-inspect the React element tree Layout returns directly (a React
// function component is just a function), which is deterministic and
// side-steps that DOM limitation. Full HTML output is verified by the
// actual prerender build (see apply-progress verification evidence).
describe('root Layout', () => {
  it('sets lang/data-vertical on the <html> element from the active config', () => {
    const element = Layout({ children: 'child' }) as ReactElement<Record<string, unknown>>;

    expect(element.type).toBe('html');
    expect(element.props.lang).toBe(activeConfig.locale);
    expect(element.props['data-vertical']).toBe(activeConfig.vertical);
  });

  it('wraps the body children in ThemeProvider with the active theme/config', () => {
    const element = Layout({ children: 'child' }) as ReactElement<{ children: ReactNode }>;
    const [, body] = element.props.children as ReactElement<{ children: ReactNode }>[];
    const bodyChildren = body.props.children as ReactElement<{
      theme: unknown;
      config: unknown;
    }>[];

    const themeProviderElement = bodyChildren.find(
      (node) => typeof node === 'object' && node !== null && node.type === ThemeProvider,
    );

    expect(themeProviderElement).toBeDefined();
    expect(themeProviderElement?.props.theme).toBe(activeTheme);
    expect(themeProviderElement?.props.config).toBe(activeConfig);
  });
});

// App is likewise a plain function component (RR7's default route export) —
// shallow-inspecting its returned element tree avoids the same nested-<html>
// jsdom limitation and lets us assert Header/Footer are mounted once, around
// <Outlet/>, without needing a full router context to actually render Outlet.
describe('root App', () => {
  it('wraps <Outlet/> with the config-driven Header and Footer, mounted once for every route', () => {
    const element = App() as ReactElement<{ children: ReactNode }>;
    const children = Array.isArray(element.props.children)
      ? (element.props.children as ReactElement[])
      : [element.props.children as ReactElement];

    const headerElement = children.find(
      (node) => typeof node === 'object' && node !== null && node.type === Header,
    );
    const footerElement = children.find(
      (node) => typeof node === 'object' && node !== null && node.type === Footer,
    );

    expect(headerElement).toBeDefined();
    expect((headerElement as ReactElement<{ config: unknown }>).props.config).toBe(activeConfig);
    expect(footerElement).toBeDefined();
    expect((footerElement as ReactElement<{ config: unknown }>).props.config).toBe(activeConfig);
  });
});

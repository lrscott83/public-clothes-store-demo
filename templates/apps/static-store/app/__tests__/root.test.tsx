import { describe, it, expect } from 'vitest';
import type { ReactElement, ReactNode } from 'react';
import { ThemeProvider } from '@store-mgmt/storefront/theme';
import { Layout } from '../root';
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

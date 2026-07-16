import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pathToRedirect, redirectToPath } from './spa-redirect.mjs';

const base = { protocol: 'https:', hostname: 'lrscott83.github.io', port: '', hash: '' };
const loc = (pathname, search = '', hash = '') => ({ ...base, pathname, search, hash });

test('pathToRedirect encodes a deep route into the query', () => {
  const out = pathToRedirect(loc('/public-clothes-store-demo/salesops/decisiones'), 2);
  assert.equal(out, 'https://lrscott83.github.io/public-clothes-store-demo/salesops/?/decisiones');
});

test('pathToRedirect encodes a nested deep route', () => {
  const out = pathToRedirect(loc('/public-clothes-store-demo/salesops/catalog/x'), 2);
  assert.equal(out, 'https://lrscott83.github.io/public-clothes-store-demo/salesops/?/catalog/x');
});

test('pathToRedirect preserves an existing query string as ~and~', () => {
  const out = pathToRedirect(loc('/public-clothes-store-demo/salesops/decisiones', '?foo=1&bar=2'), 2);
  assert.equal(
    out,
    'https://lrscott83.github.io/public-clothes-store-demo/salesops/?/decisiones&foo=1~and~bar=2',
  );
});

test('pathToRedirect preserves a hash', () => {
  const out = pathToRedirect(loc('/public-clothes-store-demo/salesops/decisiones', '', '#section'), 2);
  assert.equal(
    out,
    'https://lrscott83.github.io/public-clothes-store-demo/salesops/?/decisiones#section',
  );
});

test('pathToRedirect returns null at the kept-segments root', () => {
  assert.equal(pathToRedirect(loc('/public-clothes-store-demo/salesops/'), 2), null);
});

test('redirectToPath reconstructs the real path from the marker', () => {
  const out = redirectToPath(loc('/public-clothes-store-demo/salesops/', '?/decisiones'));
  assert.equal(out, '/public-clothes-store-demo/salesops/decisiones');
});

test('redirectToPath decodes ~and~ back to &', () => {
  const out = redirectToPath(loc('/public-clothes-store-demo/salesops/', '?/decisiones&foo=1~and~bar=2'));
  assert.equal(out, '/public-clothes-store-demo/salesops/decisiones?foo=1&bar=2');
});

test('redirectToPath returns null with no marker', () => {
  assert.equal(redirectToPath(loc('/public-clothes-store-demo/salesops/', '?foo=1')), null);
});

test('round trip recovers the original path', () => {
  const original = '/public-clothes-store-demo/salesops/catalog/x';
  const encoded = pathToRedirect(loc(original), 2);
  const u = new URL(encoded);
  const restored = redirectToPath({ ...base, pathname: u.pathname, search: u.search, hash: u.hash });
  assert.equal(restored, original);
});

import { render404Html, injectDecodeSnippet } from './spa-redirect.mjs';

test('render404Html embeds the redirect fn, segment count, and home link', () => {
  const html = render404Html('function pathToRedirect(){return null;}', 2, '/public-clothes-store-demo/salesops/');
  assert.match(html, /function pathToRedirect\(\)\{return null;\}/);
  assert.match(html, /pathToRedirect\(window\.location,2\)/);
  assert.match(html, /href="\/public-clothes-store-demo\/salesops\/"/);
  assert.match(html, /window\.location\.replace/);
});

test('injectDecodeSnippet inserts the decode script right after <head>', () => {
  const out = injectDecodeSnippet('<html><head><meta charset="utf-8"></head><body></body></html>', 'function redirectToPath(){return null;}');
  assert.ok(out.startsWith('<html><head><script>'), 'script must follow <head>');
  assert.match(out, /function redirectToPath\(\)\{return null;\}/);
  assert.match(out, /history\.replaceState/);
  assert.match(out, /<meta charset="utf-8">/); // original head content preserved
});

test('injectDecodeSnippet throws when there is no <head>', () => {
  assert.throws(() => injectDecodeSnippet('<html><body></body></html>', 'fn'), /<head>/);
});

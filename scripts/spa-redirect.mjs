// Pure redirect helpers for hosting react-router SPA apps on GitHub Pages.
// The same source runs in two places: imported here for unit tests, and
// embedded verbatim (via .toString()) into the generated static HTML. Keep
// them as named function declarations with no external references.

export function pathToRedirect(loc, segmentsToKeep) {
  const keptRoot = loc.pathname.split('/').slice(0, 1 + segmentsToKeep).join('/');
  const rest = loc.pathname.slice(1).split('/').slice(segmentsToKeep).join('/');
  if (!rest && (!loc.search || loc.search[1] === '/')) return null;
  const origin = loc.protocol + '//' + loc.hostname + (loc.port ? ':' + loc.port : '');
  return (
    origin +
    keptRoot +
    '/?/' +
    rest.replace(/&/g, '~and~') +
    (loc.search ? '&' + loc.search.slice(1).replace(/&/g, '~and~') : '') +
    loc.hash
  );
}

export function redirectToPath(loc) {
  if (loc.search[1] !== '/') return null;
  const decoded = loc.search
    .slice(1)
    .split('&')
    .map(function (s) {
      return s.replace(/~and~/g, '&');
    })
    .join('?');
  return loc.pathname.slice(0, -1) + decoded + loc.hash;
}

export function render404Html(redirectFnSource, segmentsToKeep, homeUrl) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>Redirecting…</title>
<script>(function(){${redirectFnSource}var t=pathToRedirect(window.location,${segmentsToKeep});if(t){window.location.replace(t);}})();</script>
</head>
<body>
<p>If you are not redirected, <a href="${homeUrl}">go to the home page</a>.</p>
</body>
</html>
`;
}

export function injectDecodeSnippet(html, decodeFnSource) {
  if (!html.includes('<head>')) {
    throw new Error('Cannot inject decode snippet: no <head> in HTML.');
  }
  const script =
    '<script>(function(){' +
    decodeFnSource +
    'var p=redirectToPath(window.location);if(p){window.history.replaceState(null,null,p);}})();</script>';
  return html.replace('<head>', '<head>' + script);
}

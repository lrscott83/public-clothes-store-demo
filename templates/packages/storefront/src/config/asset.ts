/**
 * Joins a path onto a base subpath (e.g. Vite's `import.meta.env.BASE_URL`
 * on GitHub Pages, `/repo-name/`), normalizing leading/trailing slashes so
 * the result never has a double or missing slash.
 */
export function withBase(path: string, base: string = import.meta.env.BASE_URL): string {
  const normalizedBase = base.endsWith('/') ? base : `${base}/`;
  const normalizedPath = path.startsWith('/') ? path.slice(1) : path;
  return `${normalizedBase}${normalizedPath}`;
}

/**
 * Builds a base-path-aware URL for a static asset that lives under a
 * vertical's `public/verticals/{slug}/` folder.
 */
export function verticalAsset(slug: string, key: string, base: string = import.meta.env.BASE_URL): string {
  return withBase(`verticals/${slug}/${key}`, base);
}

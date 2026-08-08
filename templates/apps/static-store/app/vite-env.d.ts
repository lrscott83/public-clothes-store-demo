/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Selects the active vertical's config; unset/empty falls back to the default vertical. */
  readonly VITE_STORE_VERTICAL?: string;
  /** Base subpath the app is served under (e.g. GitHub Pages `/repo-name/`); defaults to `/`. */
  readonly VITE_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

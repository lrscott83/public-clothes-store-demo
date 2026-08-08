/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base subpath the app is served under (e.g. GitHub Pages `/repo-name/`); defaults to `/`. */
  readonly VITE_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

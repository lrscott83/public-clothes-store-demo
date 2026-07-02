// Ambient typing for `import.meta.env.BASE_URL`, which Vite (and Vitest,
// which shares Vite's env handling) injects at build/test time. Declared
// locally rather than via `/// <reference types="vite/client" />` so this
// package's typecheck does not require a direct `vite` dependency of its
// own (package.json intentionally lists only react/react-dom — see
// design.md Section 1). Consumers (e.g. static-store) still get the fuller
// `vite/client` types via their own app-level `vite-env.d.ts`.
interface ImportMetaEnv {
  readonly BASE_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

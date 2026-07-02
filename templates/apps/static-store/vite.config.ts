import { reactRouter } from '@react-router/dev/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tailwindcss(), reactRouter(), tsconfigPaths()],
  server: {
    port: 3334,
    host: 'localhost',
  },
  preview: {
    port: 3334,
    host: 'localhost',
  },
  resolve: {
    // Force a single copy of React and React Router. web-common declares its
    // own react/react-dom/react-router deps; without dedupe pnpm resolves them
    // as separate instances, producing "Cannot read properties of null
    // (reading 'useContext')" during client render.
    dedupe: ['react', 'react-dom', 'react-router'],
  },
  optimizeDeps: {
    include: ['@store-mgmt/domain', '@store-mgmt/storefront'],
  },
});

import { Outlet } from 'react-router';
import { Sidebar } from '../components/sidebar';

/**
 * App-level layout route: renders the sidebar ONCE, always visible, wrapping
 * the welcome index page and all 7 screen routes via <Outlet/>. This is the
 * "second" layout (below root's document-level Layout) that gives the app
 * its persistent chrome, analogous to static-store's Header/Footer in
 * `App()` — but here the shell is a proper RR7 layout() route instead of
 * living in root.tsx, since salesops-mvp has no per-vertical config to key
 * a document-level Header off of.
 */
export default function ShellLayout() {
  return (
    <div className="flex h-screen w-full overflow-hidden">
      <Sidebar />
      {/* pt-14 clears the fixed mobile top bar; the desktop sidebar is in-flow. */}
      <main className="flex-1 overflow-y-auto pt-14 md:pt-0">
        <Outlet />
      </main>
    </div>
  );
}

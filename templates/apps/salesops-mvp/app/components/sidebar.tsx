import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router';
import {
  ArrowLeftRight,
  BarChart3,
  Landmark,
  Menu,
  Package,
  ShoppingCart,
  Users,
  Warehouse,
  X,
  type LucideIcon,
} from 'lucide-react';

interface NavItem {
  label: string;
  path: string;
  icon: LucideIcon;
}

// One entry per screen (7 total) — the persistent sidebar's navigation
// targets. The welcome/landing route (`/`) is intentionally NOT listed here;
// it's reached via the brand link, not a nav item.
const NAV_ITEMS: NavItem[] = [
  { label: 'Nuevo pedido', path: '/pedidos/nuevo', icon: ShoppingCart },
  { label: 'Operador de gestores', path: '/operador-gestores', icon: Users },
  { label: 'Operador de almacén', path: '/operador-almacen', icon: Warehouse },
  { label: 'Tasas de cambio', path: '/tasas', icon: ArrowLeftRight },
  { label: 'Inventario', path: '/inventario', icon: Package },
  { label: 'Decisiones', path: '/decisiones', icon: BarChart3 },
  { label: 'Finanzas', path: '/finanzas', icon: Landmark },
];

/** The 7 screen links. Shared by the desktop sidebar and the mobile dropdown. */
function NavLinks({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <>
      {NAV_ITEMS.map((item) => {
        const isActive = pathname === item.path;
        const Icon = item.icon;
        return (
          <Link
            key={item.path}
            to={item.path}
            onClick={onNavigate}
            aria-current={isActive ? 'page' : undefined}
            className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              isActive
                ? 'bg-primary-light text-primary'
                : 'text-text hover:bg-background hover:text-primary'
            }`}
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </>
  );
}

/**
 * App navigation, rendered once by the `_shell` layout route. Responsive:
 * - `md+`: a persistent left sidebar (the original always-visible chrome).
 * - `< md`: a fixed top bar with a hamburger toggle that drops the same nav
 *   down over the content. The mobile menu closes on navigation, on outside
 *   tap, and on Escape.
 */
export function Sidebar() {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);

  // Close the mobile menu whenever the route changes.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Close on Escape while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      {/* Desktop sidebar (md+). */}
      <aside className="hidden h-full w-60 shrink-0 flex-col border-r border-border bg-surface md:flex">
        <Link to="/" className="px-4 py-5 text-lg font-bold text-text">
          Sales Ops
        </Link>
        <nav aria-label="Main" className="flex flex-col gap-1 px-2">
          <NavLinks pathname={pathname} />
        </nav>
      </aside>

      {/* Mobile top bar (fixed, < md). */}
      <header className="fixed inset-x-0 top-0 z-40 flex h-14 items-center justify-between border-b border-border bg-surface px-4 md:hidden">
        <Link to="/" className="text-lg font-bold text-text">
          Sales Ops
        </Link>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls="mobile-nav"
          aria-label={open ? 'Cerrar menú' : 'Abrir menú'}
          className="inline-flex h-10 w-10 items-center justify-center rounded-md text-text transition-colors hover:bg-background hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          {open ? (
            <X className="h-5 w-5" aria-hidden="true" />
          ) : (
            <Menu className="h-5 w-5" aria-hidden="true" />
          )}
        </button>
      </header>

      {/* Mobile dropdown nav. */}
      {open && (
        <div className="md:hidden">
          <div
            className="fixed inset-0 top-14 z-30 bg-black/20"
            aria-hidden="true"
            onClick={() => setOpen(false)}
          />
          <nav
            id="mobile-nav"
            aria-label="Main"
            className="fixed inset-x-0 top-14 z-40 flex max-h-[calc(100vh-3.5rem)] flex-col gap-1 overflow-y-auto border-b border-border bg-surface p-2 shadow-card"
          >
            <NavLinks pathname={pathname} onNavigate={() => setOpen(false)} />
          </nav>
        </div>
      )}
    </>
  );
}

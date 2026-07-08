import { Link, useLocation } from 'react-router';
import {
  ArrowLeftRight,
  BarChart3,
  Landmark,
  Package,
  ShoppingCart,
  Users,
  Warehouse,
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

/**
 * Always-visible sidebar rendered once by the `_shell` layout route (see
 * app/routes/_shell.tsx), wrapping every screen via <Outlet/>. Exactly 7
 * links, one per screen — the landing/welcome route is reached via the
 * brand link, not a nav item.
 */
export function Sidebar() {
  const { pathname } = useLocation();

  return (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r border-border bg-surface">
      <Link to="/" className="px-4 py-5 text-lg font-bold text-text">
        Sales Ops
      </Link>
      <nav aria-label="Main" className="flex flex-col gap-1 px-2">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.path;
          const Icon = item.icon;

          return (
            <Link
              key={item.path}
              to={item.path}
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
      </nav>
    </aside>
  );
}

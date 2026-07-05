import { useState } from 'react';
import { Link } from 'react-router';
import { Menu, Package, Store, ShoppingBag, X } from 'lucide-react';
import type { StoreConfig } from '@store-mgmt/storefront/config';

const LOGO_ICONS = { Store, ShoppingBag, Package } as const;

/**
 * Theme-token tint classes for the logo icon fallback. Kept as a literal
 * lookup (not a template-literal class) so Tailwind's build-time class
 * scanner can see every possible utility.
 */
const TINT_CLASS: Record<string, string> = {
  primary: 'text-primary',
  primaryHover: 'text-primary-hover',
  primaryLight: 'text-primary-light',
  secondary: 'text-secondary',
  accent: 'text-accent',
  background: 'text-background',
  surface: 'text-surface',
  text: 'text-text',
  textMuted: 'text-text-muted',
  border: 'text-border',
  success: 'text-success',
  danger: 'text-danger',
  warning: 'text-warning',
  info: 'text-info',
};

export interface HeaderProps {
  config: StoreConfig;
  /**
   * Anchor `path`s (`#id`) to drop from the nav because their target section
   * isn't rendered — e.g. `#novedades` when the catalog has no new products.
   * Route entries are never filtered. Defaults to showing every nav item.
   */
  hiddenAnchors?: string[];
}

/**
 * Config-driven storefront header: brand + logo (image or a whitelisted
 * lucide icon fallback, tinted via a theme token) and the nav, rendering
 * router `<Link>`s for `kind: 'route'` entries and plain anchors for
 * `kind: 'anchor'` entries. Contains zero hardcoded brand/nav copy. Stays
 * `fixed` to the top across every route.
 */
export function Header({ config, hiddenAnchors = [] }: HeaderProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const LogoIcon = LOGO_ICONS[config.logo.icon ?? 'Store'];
  const tintClass = TINT_CLASS[config.logo.tintToken ?? 'primary'] ?? 'text-primary';

  // Keep the nav in lockstep with the sections the home page actually renders:
  // an anchor whose section is absent would otherwise scroll to nothing.
  const navItems = config.nav.filter(
    (item) => !(item.kind === 'anchor' && hiddenAnchors.includes(item.path)),
  );

  return (
    <header className="fixed top-0 inset-x-0 z-50 bg-surface/95 backdrop-blur-sm shadow-card">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <Link
            to="/"
            className="flex items-center gap-2 text-lg sm:text-xl font-bold text-text"
          >
            {config.logo.image ? (
              <img
                src={config.logo.image}
                alt={config.logo.alt}
                className="h-8 w-8 object-contain"
              />
            ) : (
              <LogoIcon className={`h-7 w-7 shrink-0 ${tintClass}`} aria-hidden="true" />
            )}
            <span className="truncate">{config.brand.name}</span>
          </Link>

          <nav className="hidden md:flex items-center gap-8">
            {navItems.map((item) => (
              <NavLink key={item.path} item={item} />
            ))}
          </nav>

          <button
            type="button"
            className="md:hidden p-2 -mr-2 text-text"
            aria-label="Toggle navigation menu"
            aria-expanded={isMenuOpen}
            onClick={() => setIsMenuOpen((open) => !open)}
          >
            {isMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
      </div>

      {isMenuOpen && (
        <div className="md:hidden bg-surface border-t border-border shadow-card">
          <div className="px-2 pt-2 pb-3 space-y-1">
            {navItems.map((item) => (
              <NavLink
                key={item.path}
                item={item}
                mobile
                onNavigate={() => setIsMenuOpen(false)}
              />
            ))}
          </div>
        </div>
      )}
    </header>
  );
}

function NavLink({
  item,
  mobile = false,
  onNavigate,
}: {
  item: StoreConfig['nav'][number];
  mobile?: boolean;
  onNavigate?: () => void;
}) {
  const className = mobile
    ? 'block px-3 py-2 rounded-md text-base font-medium text-text hover:bg-background hover:text-primary transition-colors'
    : 'text-sm font-medium text-text hover:text-primary transition-colors';

  if (item.kind === 'route') {
    return (
      <Link key={item.path} to={item.path} className={className} onClick={onNavigate}>
        {item.label}
      </Link>
    );
  }

  return (
    <a key={item.path} href={item.path} className={className} onClick={onNavigate}>
      {item.label}
    </a>
  );
}

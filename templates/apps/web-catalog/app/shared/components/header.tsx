import { Link } from 'react-router';
import { Package, ShoppingBag, Store } from 'lucide-react';
import type { StoreConfig } from '../config/stores/types';

const LOGO_ICONS = { Store, ShoppingBag, Package } as const;

/**
 * Theme-token tint classes for the logo icon fallback. Kept as a literal
 * lookup (not a template-literal class) so Tailwind's build-time class
 * scanner can see every possible utility — mirrors the (frozen, read-only)
 * `static-store/app/components/header.tsx` convention this file's design is
 * copied from (design.md D9: the design is copied, the code is not).
 */
const TINT_CLASS: Record<string, string> = {
  primary: 'text-primary',
  secondary: 'text-secondary',
  accent: 'text-accent',
  text: 'text-text',
  textMuted: 'text-text-muted',
};

export interface HeaderProps {
  config: StoreConfig;
}

/** Config-driven storefront header: brand + logo, and the nav. Fixed to the top across every route (root.tsx). */
export function Header({ config }: HeaderProps) {
  const LogoIcon = LOGO_ICONS[config.logo.icon ?? 'Store'];
  const tintClass = TINT_CLASS[config.logo.tintToken ?? 'primary'] ?? 'text-primary';

  return (
    <header className="fixed top-0 inset-x-0 z-50 bg-surface/95 backdrop-blur-sm shadow-card">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <Link to="/" className="flex items-center gap-2 text-lg sm:text-xl font-bold text-text">
            {config.logo.image ? (
              <img src={config.logo.image} alt={config.logo.alt} className="h-8 w-8 object-contain" />
            ) : (
              <LogoIcon className={`h-7 w-7 shrink-0 ${tintClass}`} aria-hidden="true" />
            )}
            <span className="truncate">{config.brand.name}</span>
          </Link>

          <nav className="flex items-center gap-6 sm:gap-8">
            {config.nav.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className="text-sm font-medium text-text hover:text-primary transition-colors"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </div>
    </header>
  );
}

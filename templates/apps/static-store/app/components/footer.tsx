import { Link } from 'react-router';
import type { StoreConfig } from '@store-mgmt/storefront/config';

export interface FooterProps {
  config: StoreConfig;
}

/**
 * Config-driven storefront footer. No legacy equivalent — this is a fresh
 * component. `linkGroups`/`contact`/`social` are all optional and degrade
 * gracefully (never render as literal "undefined" text); only `copyright`
 * is required.
 */
export function Footer({ config }: FooterProps) {
  const { footer } = config;
  const hasLinkGroups = Boolean(footer.linkGroups && footer.linkGroups.length > 0);

  return (
    <footer className="bg-surface border-t border-border py-12">
      <div className="container mx-auto px-4">
        {(hasLinkGroups || footer.contact || footer.social) && (
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4 mb-8">
            {footer.linkGroups?.map((group) => (
              <div key={group.title}>
                <h3 className="text-sm font-semibold text-text mb-3">{group.title}</h3>
                <ul className="space-y-2">
                  {group.links.map((link) =>
                    link.kind === 'route' ? (
                      <li key={link.path}>
                        <Link to={link.path} className="text-sm text-text-muted hover:text-text">
                          {link.label}
                        </Link>
                      </li>
                    ) : (
                      <li key={link.path}>
                        <a href={link.path} className="text-sm text-text-muted hover:text-text">
                          {link.label}
                        </a>
                      </li>
                    ),
                  )}
                </ul>
              </div>
            ))}

            {(footer.contact || footer.social) && (
              <div>
                <h3 className="text-sm font-semibold text-text mb-3">Contact</h3>
                {footer.contact && <p className="text-sm text-text-muted">{footer.contact}</p>}
                {footer.social && footer.social.length > 0 && (
                  <ul className="flex gap-4 mt-3">
                    {footer.social.map((social) => (
                      <li key={social.url}>
                        <a
                          href={social.url}
                          className="text-sm text-text-muted hover:text-text"
                        >
                          {social.label}
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}

        <p className="text-sm text-text-muted">{footer.copyright}</p>
      </div>
    </footer>
  );
}

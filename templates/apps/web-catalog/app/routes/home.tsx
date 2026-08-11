import { Hero } from '../shared/components/hero';
import { resolveStoreConfig } from '../shared/lib/store-config.server';
import type { StoreConfig } from '../shared/config/stores/types';
import type { Route } from './+types/home';

export function meta(_args: Route.MetaArgs) {
  return [{ title: 'Inicio' }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const config = resolveStoreConfig(request);
  return { config };
}

export interface HomePageProps {
  config: StoreConfig;
}

/** Config-driven landing page. `/productos` (Phase 5, next work unit) owns the catalog itself. */
export function HomePage({ config }: HomePageProps) {
  return (
    <main>
      <Hero config={config} />
    </main>
  );
}

export default function Home({ loaderData }: Route.ComponentProps) {
  return <HomePage config={loaderData.config} />;
}

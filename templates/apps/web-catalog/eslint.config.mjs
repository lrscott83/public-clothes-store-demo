import config from '@store-mgmt/eslint-config/react-router';
import { frozenStorefrontBoundaryRule } from '@store-mgmt/eslint-config/backend-boundaries';

// public-catalog design.md D9/§6: `packages/storefront` is FROZEN.
// `web-catalog` copies its design by writing new code — it must never
// import the frozen package itself. Wired here (Phase 5's scaffold) so the
// boundary is enforced by lint, not by discipline.
export default [...config, frozenStorefrontBoundaryRule];

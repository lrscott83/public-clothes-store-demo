import type { Config } from '@react-router/dev/config';

export default {
  // Server-rendered (design.md §1): every backend call is server-to-server
  // from a loader/action, never from the browser — this is RR7's DEFAULT
  // mode, stated explicitly because this template's sibling app
  // (`static-store`) overrides it to `ssr: false`. This app must NOT copy
  // that override.
  ssr: true,
} satisfies Config;

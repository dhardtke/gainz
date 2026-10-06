/**
 * The component stylesheets a built bundle carries as text, so it never fetches one.
 *
 * This committed stub is empty, so served from source every sheet is fetched beside its module,
 * and hot reload can swap it in place. `bun run build` replaces this module while bundling (see
 * `src/backend/features/static/internal/bundle.ts`) with one that fills the map, the way it fills
 * `src/backend/shared/embedded.ts` for the server.
 */

/** Component stylesheet URL path → its text. Filled only in a built bundle. */
export const INLINE_STYLES: Readonly<Record<string, string>> = {};

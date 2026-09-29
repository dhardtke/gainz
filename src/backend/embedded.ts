/**
 * What a single-file build carries inside it.
 *
 * This committed stub exports `null`, which means "read from disk": the frontend from
 * `src/frontend/`, Pico from `node_modules` and the migrations from `src/backend/db/migrations/`.
 * `bun run build` swaps this module through `Bun.build`'s `files` option for one that exports the
 * embedded files, so a built `gainz.js` needs nothing beside it.
 */
import type { MigrationSource } from './db/migrations.ts';

export interface EmbeddedFile {
  body: string;
  type: string;
}

export interface EmbeddedWeb {
  /** Every servable file under the web root, keyed by its URL path (`/main.ts`). */
  pages: Record<string, EmbeddedFile>;
  /** Vendor files, keyed by their literal URL (`/vendor/pico.css`). */
  vendor: Record<string, EmbeddedFile>;
}

export interface Embedded extends EmbeddedWeb {
  migrations: MigrationSource[];
}

export const EMBEDDED: Embedded | null = null;

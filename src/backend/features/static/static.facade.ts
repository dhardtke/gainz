import type { EmbeddedWeb } from '../../shared/embedded.ts';
import { embedWebRoot } from './internal/embed.ts';
import { FRONTEND_DIR } from './internal/paths.ts';

/**
 * The static feature's front door. It has no table behind it; what it publishes is where the web
 * root is, so the dev feature can watch it without reaching into `internal/paths.ts`, and the web
 * root as embedded maps, so the single-file build can carry it without reaching into `internal/`.
 */
export class StaticFacade {
  webRoot(): string {
    return FRONTEND_DIR;
  }

  /**
   * Every servable frontend file, the modules as one whitespace-minified bundle at `/main.ts` that
   * carries the component stylesheets, plus the vendor files.
   */
  embed(): Promise<EmbeddedWeb> {
    return embedWebRoot();
  }
}

export function createStaticFacade(): StaticFacade {
  return new StaticFacade();
}

import { FRONTEND_DIR } from './internal/paths.ts';

/**
 * The static feature's front door. It has no table behind it; what it publishes is where the web
 * root is, so the dev feature can watch it without reaching into `internal/paths.ts`.
 */
export class StaticFacade {
  webRoot(): string {
    return FRONTEND_DIR;
  }
}

export function createStaticFacade(): StaticFacade {
  return new StaticFacade();
}

import { AuthApi } from './internal/auth.api.ts';

/** Logging in and out; the session itself is an `HttpOnly` cookie the page never sees. */
export class AuthFacade {
  readonly #api: AuthApi;

  constructor(api: AuthApi) {
    this.#api = api;
  }

  login(password: string): Promise<void> {
    return this.#api.login(password);
  }

  logout(): Promise<void> {
    return this.#api.logout();
  }
}

export const authFacade = new AuthFacade(new AuthApi());

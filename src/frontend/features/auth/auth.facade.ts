import { AuthApi } from './internal/auth.api.ts';

/** Logging in and out; the session itself is an `HttpOnly` cookie the page never sees. */
export class AuthFacade {
  readonly #api: AuthApi;

  constructor(api: AuthApi) {
    this.#api = api;
  }

  /** Whether the server asks for a login at all; it does not while no password is set. */
  async enabled(): Promise<boolean> {
    return (await this.#api.status()).enabled;
  }

  login(password: string): Promise<void> {
    return this.#api.login(password);
  }

  logout(): Promise<void> {
    return this.#api.logout();
  }
}

export const authFacade = new AuthFacade(new AuthApi());

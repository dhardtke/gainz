import type { LoginRequestDto } from '../../../shared/dto/auth.ts';
import { badRequest, unauthorized } from '../../http/errors.ts';
import { type RouteHandler, type RouteTable, wrapHandlers } from '../../http/routing.ts';
import { log } from '../../shared/log.ts';
import { LoginThrottle } from './internal/login-throttle.ts';
import { check, COOKIE_NAME, expired, issue } from './internal/session-cookie.ts';

const MAX_PASSWORD_LENGTH = 1000;
const PASSWORD_HASH = /^\$(argon2(id|i|d)|2[aby])\$/;

export interface AuthOptions {
  /** The `Bun.password` hash of the one password; null turns authentication off. */
  passwordHash: string | null;
  /** Epoch milliseconds; injectable so tests can move the clock. */
  now?: () => number;
}

export type LoginResult = { kind: 'ok'; cookie: string | null } | { kind: 'locked'; retryAfter: number };

/** Whether `value` looks like a hash `Bun.password.verify` can check: argon2 or bcrypt. */
export function isPasswordHash(value: string): boolean {
  return PASSWORD_HASH.test(value);
}

/**
 * The auth feature's front door: the password login, its throttle, and the guard that asks every
 * data route for a valid session cookie. With no password hash configured it is off — `guard`
 * hands tables back untouched and `login` lets anyone in without a cookie.
 */
export class AuthFacade {
  readonly #hash: string | null;
  readonly #now: () => number;
  readonly #throttle: LoginThrottle;

  constructor(options: AuthOptions) {
    this.#hash = options.passwordHash;
    this.#now = options.now ?? Date.now;
    this.#throttle = new LoginThrottle(this.#now);
  }

  enabled(): boolean {
    return this.#hash !== null;
  }

  /**
   * Validates first, whether or not auth is on. The throttle is asked before the password is
   * verified, so a locked login costs no hashing, and it reserves the attempt synchronously, before
   * the `await`.
   */
  async login(dto: LoginRequestDto): Promise<LoginResult> {
    const password: unknown = dto.password;
    if (typeof password !== 'string' || password === '' || password.length > MAX_PASSWORD_LENGTH) {
      throw badRequest(`"password" is required and must be a non-empty string of at most ${MAX_PASSWORD_LENGTH} characters`);
    }
    if (this.#hash === null) {
      return { kind: 'ok', cookie: null };
    }
    const decision = this.#throttle.begin();
    if (decision.kind === 'locked') {
      return decision;
    }
    if (!(await Bun.password.verify(password, this.#hash))) {
      // Before failed(), so a lockout's line follows the attempt that started it.
      log.warn('auth', 'wrong password');
      this.#throttle.failed();
      throw unauthorized('Wrong password');
    }
    this.#throttle.succeeded();
    log.info('auth', 'login');
    return { kind: 'ok', cookie: issue(this.#hash, this.#now()) };
  }

  logoutCookie(): string {
    return expired();
  }

  /**
   * Wraps every handler in `table` — a bare function or each verb of a method map — so it answers
   * 401 without a valid session cookie, and re-sets the cookie when it is due for renewal. A static
   * value (a `Response`, a file, a directory) has no handler to wrap and would slip past, so meeting
   * one is a startup error rather than an open route.
   */
  guard(table: RouteTable): RouteTable {
    const hash = this.#hash;
    if (hash === null) {
      return table;
    }
    const wrap =
      (handler: RouteHandler): RouteHandler =>
      async (req, server) => {
        const state = check(hash, req.cookies.get(COOKIE_NAME), this.#now());
        if (state === 'invalid') {
          throw unauthorized();
        }
        const res = await handler(req, server);
        if (state === 'renew' && res instanceof Response) {
          res.headers.append('Set-Cookie', issue(hash, this.#now()));
        }
        return res;
      };
    return wrapHandlers(table, 'auth guard', wrap);
  }
}

export function createAuthFacade(options: AuthOptions): AuthFacade {
  return new AuthFacade(options);
}

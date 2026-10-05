const FREE_ATTEMPTS = 5;
const BASE_LOCK_S = 60;
const MAX_LOCK_S = 3600;

export type ThrottleDecision = { kind: 'locked'; retryAfter: number } | { kind: 'go' };

/**
 * Backs off logins after consecutive failures, for every client at once: behind the reverse proxy
 * each one is 127.0.0.1, so there is no address to tell them apart by. From the fifth failure on,
 * each failure locks the login for `60 · 2^(failures − 5)` seconds, up to an hour. A success or a
 * restart resets the count. Valid cookies are not affected; only `POST /api/auth/login` asks.
 */
export class LoginThrottle {
  readonly #now: () => number;
  #failures = 0;
  #lockedUntil = 0;
  #lockS = 0;

  constructor(now: () => number) {
    this.#now = now;
  }

  /**
   * Reserves an attempt, counting it as a failure up front so concurrent guesses cannot all pass
   * this check while the first one is still being verified. `succeeded()` takes it back.
   */
  begin(): ThrottleDecision {
    const now = this.#now();
    if (now < this.#lockedUntil) {
      return { kind: 'locked', retryAfter: Math.ceil((this.#lockedUntil - now) / 1000) };
    }
    this.#failures++;
    if (this.#failures >= FREE_ATTEMPTS) {
      this.#lockS = Math.min(BASE_LOCK_S * 2 ** (this.#failures - FREE_ATTEMPTS), MAX_LOCK_S);
      this.#lockedUntil = now + this.#lockS * 1000;
    }
    return { kind: 'go' };
  }

  /** Logs the lockout a confirmed failure started; logged here, not in `begin()`, so a correct password never reports one. */
  failed(): void {
    if (this.#failures >= FREE_ATTEMPTS) {
      console.warn(`login locked for ${this.#lockS} s after ${this.#failures} failed attempts`);
    }
  }

  succeeded(): void {
    this.#failures = 0;
    this.#lockedUntil = 0;
  }
}

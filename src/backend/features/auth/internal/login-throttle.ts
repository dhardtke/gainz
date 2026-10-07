import { log } from '../../../shared/log.ts';

const FREE_ATTEMPTS = 5;
const BASE_LOCK_S = 60;
const MAX_LOCK_S = 3600;

export type ThrottleDecision = { kind: 'locked'; retryAfter: number } | { kind: 'go' };

// Global, not per client: behind the reverse proxy every client is 127.0.0.1.
export class LoginThrottle {
  readonly #now: () => number;
  #failures = 0;
  #lockedUntil = 0;
  #lockS = 0;

  constructor(now: () => number) {
    this.#now = now;
  }

  /** Counts the attempt as a failure up front so concurrent guesses cannot all pass; `succeeded()` undoes it. */
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

  /** Logs here, not in `begin()`, so a correct password never reports a lockout. */
  failed(): void {
    if (this.#failures >= FREE_ATTEMPTS) {
      log.warn('auth', `login locked for ${this.#lockS} s after ${this.#failures} failed attempts`);
    }
  }

  succeeded(): void {
    this.#failures = 0;
    this.#lockedUntil = 0;
  }
}

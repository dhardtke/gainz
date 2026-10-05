import type { RawHtml } from '../../ui/html.ts';
import { define, GzElement } from '../../ui/base.ts';
import { html } from '../../ui/html.ts';
import { ApiError, errorMessage } from '../../http/errors.ts';
import { navigate } from '../../app/router.ts';
import { authFacade } from './auth.facade.ts';
import { nextPath } from './internal/next-path.ts';

/**
 * The login page at `/login`. It loads nothing, so it is a plain element rather than a `GzView`.
 * After a login it goes to `?next=`, where the app sent the user from, or to the dashboard.
 *
 * The hidden username field is there for password managers, which save an entry only for a form
 * that has one.
 */
export class GzLoginComponent extends GzElement {
  override async handleSubmit(action: string, form: HTMLFormElement): Promise<void> {
    if (action !== 'login') {
      return;
    }
    const button = form.querySelector('button[type="submit"]');
    const input = form.querySelector<HTMLInputElement>('input[name="password"]');
    button?.setAttribute('aria-busy', 'true');
    try {
      await authFacade.login(input?.value ?? '');
      navigate(nextPath(location.search, location.origin));
    } catch (error) {
      this.#showError(error instanceof ApiError && error.status === 401 ? 'Wrong password.' : errorMessage(error));
      input?.select();
    } finally {
      button?.removeAttribute('aria-busy');
    }
  }

  #showError(message: string): void {
    const alert = this.$<HTMLElement>('[role="alert"]');
    if (alert) {
      alert.textContent = message;
      alert.hidden = false;
    }
  }

  override template(): RawHtml {
    return html`
      <section class="vstack gap-4">
        <h1>Log in</h1>
        <form data-action="login" class="vstack gap-2">
          <input type="text" name="username" autocomplete="username" value="gainz" hidden />
          <label>
            Password
            <input type="password" name="password" placeholder="Your password" autocomplete="current-password" required autofocus />
          </label>
          <div role="alert" data-variant="error" hidden></div>
          <button type="submit">Log in</button>
        </form>
      </section>
    `;
  }
}

await define('gz-login', GzLoginComponent, import.meta.url);

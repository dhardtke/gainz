import type { RawHtml } from '../../ui/html.ts';
import { define, GzElement } from '../../ui/base.ts';
import { html } from '../../ui/html.ts';
import { ApiError, errorMessage } from '../../http/errors.ts';
import { toastError } from '../../ui/toast.ts';
import { navigate } from '../../app/router.ts';
import { authFacade } from './auth.facade.ts';
import { nextPath } from './internal/next-path.ts';

/**
 * The login page at `/login`. After a login it goes to `?next=`, where the app sent the user from,
 * or to the dashboard. While the server asks for no login at all, it goes there straight away.
 *
 * Two things here are for password managers. The form is the element's light DOM, shown through a
 * <slot>, because they search the document and not shadow roots; gz-app keeps the view itself in
 * the light DOM for the same reason. And this is a plain element rather than a GzView, because
 * gz-app connects a GzView hidden until it has loaded, and KeePassXC-Browser judges an input's size
 * once, when it is added: a form added hidden would be judged invisible and never looked at again.
 * The hidden username field is for them too: they save an entry only for a form that has one.
 */
export class GzLoginComponent extends GzElement {
  override connectedCallback(): void {
    super.connectedCallback();
    void this.#skipWithoutLogin();
  }

  async #skipWithoutLogin(): Promise<void> {
    try {
      if (!(await authFacade.enabled())) {
        navigate(nextPath(location.search, location.origin));
      }
    } catch (error) {
      toastError(error);
    }
  }

  async #login(form: HTMLFormElement): Promise<void> {
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
    const alert = this.querySelector<HTMLElement>('[role="alert"]');
    if (alert) {
      alert.textContent = message;
      alert.hidden = false;
    }
  }

  override template(): RawHtml {
    return html`
      <section class="vstack gap-4">
        <h1>Log in</h1>
        <slot></slot>
      </section>
    `;
  }

  /**
   * Fills the light DOM with the form. It gets its own submit listener rather than a `data-action`:
   * GzElement delegates from the shadow root, which a slotted form's events reach in browsers but
   * not in happy-dom.
   */
  override afterRender(): void {
    this.innerHTML = String(html`
      <form class="vstack gap-2">
        <input type="text" name="username" autocomplete="username" value="gainz" hidden />
        <label>
          Password
          <input type="password" name="password" placeholder="Your password" autocomplete="current-password" required autofocus />
        </label>
        <div role="alert" data-variant="error" hidden></div>
        <button type="submit">Log in</button>
      </form>
    `);
    const form = this.querySelector('form');
    form?.addEventListener('submit', (event) => {
      event.preventDefault();
      void this.#login(form);
    });
  }
}

await define('gz-login', GzLoginComponent, import.meta.url);

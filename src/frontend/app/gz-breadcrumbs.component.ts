import type { RawHtml } from '../ui/html.ts';
import { define, GzElement } from '../ui/base.ts';
import { html } from '../ui/html.ts';
import type { Crumb } from './router.ts';

/** The pages above the current one, outermost first, and the current page's name. */
export interface Trail {
  parents: readonly Crumb[];
  current: string;
}

/**
 * The shell's breadcrumb trail above a view, hidden while it has none. `gz-app` feeds it from the
 * matched route and the shown view's name. The parent links are plain anchors, which `gz-app` routes
 * like any other link.
 */
export class GzBreadcrumbsComponent extends GzElement {
  #trail: Trail | null = null;

  get trail(): Trail | null {
    return this.#trail;
  }

  set trail(trail: Trail | null) {
    this.#trail = trail;
    this.hidden = trail === null;
    this.render();
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.hidden = this.#trail === null;
  }

  override template(): RawHtml {
    if (!this.#trail) {
      return html``;
    }
    return html`
      <nav aria-label="Breadcrumb" data-testid="breadcrumb">
        <ol class="unstyled">
          ${this.#trail.parents.map((parent) => html`<li><a class="unstyled" href="${parent.path}" data-testid="crumb">${parent.label}</a></li>`)}
          <li><span aria-current="page" data-testid="current">${this.#trail.current}</span></li>
        </ol>
      </nav>
    `;
  }
}

await define('gz-breadcrumbs', GzBreadcrumbsComponent, import.meta.url);

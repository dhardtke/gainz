import type { RawHtml } from '../html.ts';
import { define, GzElement } from '../base.ts';
import { html } from '../html.ts';
import { pageItems } from './pagination.ts';

/**
 * The pager of a paged list: Oat's pagination (https://oat.ink/components/#pagination) for
 * `page` of `pages`, or, for a page past the last one, "No `noun` on this page." with a Go to
 * page 1 button.
 *
 * It is made of buttons rather than links: a `?page=` link would be a full page load, and only a
 * button can be disabled. It does not navigate either, because ui/ may not import the router: a
 * click emits `page-change` with the page number as its detail, and the list maps the number to
 * its own URL.
 */
class GzPaginationComponent extends GzElement {
  static observedAttributes = ['page', 'pages', 'noun'];

  attributeChangedCallback(): void {
    if (this.isConnected) {
      this.render();
    }
  }

  override handleAction(action: string, element: HTMLElement): void {
    if (action === 'page') {
      this.emit('page-change', Number(element.dataset.page));
    }
  }

  override template(): RawHtml {
    const page = Number(this.getAttribute('page') ?? 1);
    const pages = Number(this.getAttribute('pages') ?? 1);
    if (page > pages) {
      return html`
        <div class="vstack">
          <p class="empty">No ${this.getAttribute('noun') ?? 'items'} on this page.</p>
          <div><button class="outline" data-action="page" data-page="1">Go to page 1</button></div>
        </div>
      `;
    }
    return html`
      <nav aria-label="Pagination">
        <menu class="buttons">
          <li><button class="outline" data-action="page" data-page="${page - 1}" ${page <= 1 ? 'disabled' : ''}>← Previous</button></li>
          ${pageItems(page, pages).map((item) =>
            item === 'gap'
              ? html`<li><button class="outline" disabled aria-hidden="true">…</button></li>`
              : item === page
                ? html`<li><button aria-current="page" data-action="page" data-page="${item}" aria-label="Page ${item}">${item}</button></li>`
                : html`<li><button class="outline" data-action="page" data-page="${item}" aria-label="Page ${item}">${item}</button></li>`,
          )}
          <li><button class="outline" data-action="page" data-page="${page + 1}" ${page >= pages ? 'disabled' : ''}>Next →</button></li>
        </menu>
      </nav>
    `;
  }
}

await define('gz-pagination', GzPaginationComponent, import.meta.url);

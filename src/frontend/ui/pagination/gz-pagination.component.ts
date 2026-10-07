import type { RawHtml } from '../html.ts';
import { define, GzElement } from '../base.ts';
import { html } from '../html.ts';
import { pageItems } from './pagination.ts';

// Emits `page-change` rather than navigating: ui/ may not import the router.
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
          <p class="empty" data-testid="empty">No ${this.getAttribute('noun') ?? 'items'} on this page.</p>
          <div><button class="outline" data-action="page" data-page="1" data-testid="first-page">Go to page 1</button></div>
        </div>
      `;
    }
    return html`
      <nav aria-label="Pagination" data-testid="pager">
        <menu class="buttons">
          <li><button class="outline" data-action="page" data-page="${page - 1}" data-testid="previous" ${page <= 1 ? 'disabled' : ''}>← Previous</button></li>
          ${pageItems(page, pages).map((item) =>
            item === 'gap'
              ? html`<li><button class="outline" disabled aria-hidden="true" data-testid="gap">…</button></li>`
              : item === page
                ? html`<li>
                    <button aria-current="page" data-action="page" data-page="${item}" aria-label="Page ${item}" data-testid="page-${item}">${item}</button>
                  </li>`
                : html`<li>
                    <button class="outline" data-action="page" data-page="${item}" aria-label="Page ${item}" data-testid="page-${item}">${item}</button>
                  </li>`,
          )}
          <li><button class="outline" data-action="page" data-page="${page + 1}" data-testid="next" ${page >= pages ? 'disabled' : ''}>Next →</button></li>
        </menu>
      </nav>
    `;
  }
}

await define('gz-pagination', GzPaginationComponent, import.meta.url);

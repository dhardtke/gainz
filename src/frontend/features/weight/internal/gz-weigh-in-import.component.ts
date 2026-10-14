import type { RawHtml } from '../../../ui/html.ts';
import { define, GzElement } from '../../../ui/base.ts';
import { html } from '../../../ui/html.ts';
import { formatDate, plural } from '../../../ui/format.ts';
import { toast, toastError } from '../../../ui/toast.ts';
import { confirmAction } from '../../../ui/confirm/confirm.ts';
import { weighInFacade } from '../weight.facade.ts';
import { EufyFormatError, type EufyMember, parseEufyCsv } from './eufy.ts';

export const WEIGH_INS_IMPORTED_EVENT = 'weigh-ins-imported';

function span(member: EufyMember): string {
  return `${formatDate(member.weighIns[0]?.measuredOn)} – ${formatDate(member.weighIns.at(-1)?.measuredOn)}`;
}

export class GzWeighInImportComponent extends GzElement {
  #members: EufyMember[] = [];

  override afterRender(): void {
    this.$<HTMLInputElement>('input[type=file]')?.addEventListener('change', (event) => {
      if (event.target instanceof HTMLInputElement) {
        void this.#read(event.target.files?.[0]);
      }
    });
    this.$('select')?.addEventListener('change', () => {
      this.#showStatus(null);
    });
  }

  async #read(file: File | undefined): Promise<void> {
    this.#members = [];
    let error: string | null = null;
    if (file) {
      try {
        this.#members = parseEufyCsv(await file.text());
        error = this.#members.length === 0 ? 'The file holds no weigh-ins.' : null;
      } catch (cause) {
        error = cause instanceof EufyFormatError ? cause.message : 'Could not read the file.';
      }
    }
    this.#showMembers();
    this.#showStatus(error);
  }

  #chosen(): EufyMember | undefined {
    const name = this.$<HTMLSelectElement>('select')?.value;
    return this.#members.find((member) => member.name === name) ?? this.#members[0];
  }

  // Not render(): it would clear the file input.
  #showMembers(): void {
    const field = this.$<HTMLElement>('.member');
    const select = this.$<HTMLSelectElement>('select');
    if (field && select) {
      field.hidden = this.#members.length < 2;
      select.innerHTML = String(
        html`${this.#members.map((member) => html`<option value="${member.name}">${member.name} · ${plural(member.weighIns.length, 'weigh-in')}</option>`)}`,
      );
    }
    const button = this.$<HTMLButtonElement>('button[type=submit]');
    if (button) {
      button.disabled = this.#members.length === 0;
    }
  }

  #showStatus(error: string | null): void {
    const status = this.$('.status');
    const member = this.#chosen();
    if (status) {
      status.innerHTML = String(
        error !== null
          ? html`<div role="alert" data-variant="error" data-testid="import-error">${error}</div>`
          : member
            ? html`<p class="text-light" data-testid="import-summary">${plural(member.weighIns.length, 'weigh-in')} · ${span(member)}</p>`
            : html``,
      );
    }
  }

  override async handleSubmit(action: string, form: HTMLFormElement): Promise<void> {
    const member = this.#chosen();
    if (action !== 'import' || member === undefined) {
      return;
    }
    const count = plural(member.weighIns.length, 'weigh-in');
    if (
      !(await confirmAction({
        title: `Import ${count}?`,
        message: `${span(member)}. A weigh-in already logged on one of these dates is replaced.`,
        confirmLabel: 'Import',
      }))
    ) {
      return;
    }
    let replaced: number;
    try {
      ({ replaced } = await weighInFacade.importAll({ items: member.weighIns }));
    } catch (error) {
      toastError(error);
      return;
    }
    toast(replaced === 0 ? `Imported ${count}` : `Imported ${count}, ${replaced} replaced`, 'success');
    form.reset();
    this.#members = [];
    this.#showMembers();
    this.#showStatus(null);
    this.emit(WEIGH_INS_IMPORTED_EVENT);
  }

  override template(): RawHtml {
    return html`
      <article class="card">
        <form data-action="import" data-testid="import-form">
          <h2>Import from EufyLife</h2>
          <p class="text-light">In the EufyLife app, export under Me → Data → Export All Data, then choose the CSV here.</p>
          <div class="fields">
            <div class="field">
              <label for="file">CSV file</label>
              <input id="file" name="file" type="file" accept=".csv,text/csv" required data-testid="import-file" />
            </div>
            <div class="field member" hidden>
              <label for="member">Family member</label>
              <select id="member" name="member" data-testid="import-member"></select>
            </div>
            <button type="submit" disabled data-testid="import">Import</button>
          </div>
          <div class="status"></div>
        </form>
      </article>
    `;
  }
}

await define('gz-weigh-in-import', GzWeighInImportComponent, import.meta.url);

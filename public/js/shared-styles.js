/**
 * One constructable stylesheet adopted by every component's shadow root.
 *
 * Shadow DOM keeps component CSS from leaking, but that also means each root
 * starts bare — sharing a single sheet object gives every component the same
 * buttons, inputs and cards without duplicating rules or re-parsing CSS.
 */
const CSS = `
  :host {
    display: block;
    font-family: var(--font);
    color: var(--text);
  }

  *, *::before, *::after { box-sizing: border-box; }

  h1, h2, h3 { margin: 0; line-height: 1.25; font-weight: 650; letter-spacing: -0.01em; }
  h1 { font-size: 1.6rem; }
  h2 { font-size: 1.15rem; }
  h3 { font-size: 1rem; }
  p { margin: 0; }

  a { color: var(--accent); text-decoration: none; }
  a:hover { text-decoration: underline; }

  .muted { color: var(--text-muted); }
  .small { font-size: 0.85rem; }
  .mono { font-family: var(--font-mono); font-variant-numeric: tabular-nums; }
  .nowrap { white-space: nowrap; }

  .stack { display: flex; flex-direction: column; gap: var(--gap); }
  .stack-sm { display: flex; flex-direction: column; gap: 8px; }
  .row { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .row-between { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
  .grow { flex: 1 1 auto; min-width: 0; }

  .card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
    padding: var(--gap);
  }

  .empty {
    border: 1px dashed var(--border-strong);
    border-radius: var(--radius);
    padding: 28px 20px;
    text-align: center;
    color: var(--text-muted);
  }

  .badge {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 999px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    font-size: 0.78rem;
    color: var(--text-muted);
    white-space: nowrap;
  }

  /* ------------------------------------------------------------- controls */

  button {
    font: inherit;
    font-weight: 550;
    padding: 8px 14px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border-strong);
    background: var(--surface);
    color: var(--text);
    cursor: pointer;
    transition: background 120ms ease, border-color 120ms ease, opacity 120ms ease;
  }
  button:hover:not(:disabled) { background: var(--surface-2); }
  button:disabled { opacity: 0.55; cursor: not-allowed; }
  button:focus-visible, input:focus-visible, select:focus-visible, textarea:focus-visible, a:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  button.primary {
    background: var(--accent);
    border-color: var(--accent);
    color: var(--accent-contrast);
  }
  button.primary:hover:not(:disabled) { filter: brightness(1.08); background: var(--accent); }

  button.ghost { border-color: transparent; background: transparent; color: var(--text-muted); }
  button.ghost:hover:not(:disabled) { background: var(--surface-2); color: var(--text); }

  button.danger { color: var(--danger); border-color: transparent; background: transparent; }
  button.danger:hover:not(:disabled) { background: var(--danger-soft); }

  button.small { padding: 4px 9px; font-size: 0.85rem; }

  label { font-size: 0.85rem; font-weight: 550; color: var(--text-muted); display: block; margin-bottom: 4px; }

  input, select, textarea {
    font: inherit;
    width: 100%;
    padding: 8px 10px;
    color: var(--text);
    background: var(--surface);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-sm);
  }
  input[type="number"] { font-variant-numeric: tabular-nums; }
  textarea { resize: vertical; min-height: 68px; }
  input::placeholder, textarea::placeholder { color: var(--text-muted); opacity: 0.7; }

  .field { min-width: 0; }
  .fields { display: flex; gap: 10px; flex-wrap: wrap; align-items: flex-end; }

  .error-text { color: var(--danger); font-size: 0.85rem; }

  /* ---------------------------------------------------------------- tables */

  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--border); }
  th { font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-muted); font-weight: 600; }
  tbody tr:last-child td { border-bottom: none; }
  td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }

  .scroll-x { overflow-x: auto; }

  @media (max-width: 560px) {
    .fields { gap: 8px; }
  }
`;

export const sharedStyles = new CSSStyleSheet();
sharedStyles.replaceSync(CSS);

/**
 * Development only: the hot-reload client. The server injects this module into the index page when
 * started with `GAINZ_DEV=1` and pushes one message per saved file under `src/frontend/`.
 */

/** Declared here rather than imported: the frontend keeps its own types, and this is no DTO. */
type Change = { swap: string } | { reload: string };

const WS_URL = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/dev/ws`;

/** A backend edit restarts the server under `bun --watch`, so a dropped socket is expected. */
const BACKOFF_MS = [250, 500, 1000, 2000];

function isChange(value: unknown): value is Change {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const swap: unknown = Reflect.get(value, 'swap');
  const reload: unknown = Reflect.get(value, 'reload');
  return typeof swap === 'string' || typeof reload === 'string';
}

function apply(change: Change): void {
  console.log(`gainz: reloading for ${'swap' in change ? change.swap : change.reload}`);
  location.reload();
}

function connect(attempt: number): void {
  const socket = new WebSocket(WS_URL);
  let opened = false;

  socket.addEventListener('open', () => {
    opened = true;
    console.log('gainz: hot reload connected');
  });

  socket.addEventListener('message', (event) => {
    const data: unknown = typeof event.data === 'string' ? JSON.parse(event.data) : null;
    if (isChange(data)) {
      apply(data);
    }
  });

  socket.addEventListener('close', () => {
    // A socket that was open starts the backoff over; one that never opened waits longer each time.
    const failures = opened ? 0 : attempt;
    const delay = BACKOFF_MS[Math.min(failures, BACKOFF_MS.length - 1)];
    setTimeout(() => {
      connect(failures + 1);
    }, delay);
  });
}

connect(0);

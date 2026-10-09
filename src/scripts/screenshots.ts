import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase } from '../backend/db/db.ts';
import type { DB } from '../backend/db/db.ts';
import { createExerciseFacade } from '../backend/features/exercises/exercises.facade.ts';
import { createWorkoutFacades } from '../backend/features/workouts/workouts.facade.ts';
import { startServer } from '../backend/http/server.ts';

const OUT_DIR = 'docs/screenshots';
const THEMES = ['light', 'dark'] as const;

const BROWSERS = [
  process.env.GAINZ_BROWSER,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  Bun.which('google-chrome'),
  Bun.which('chromium'),
  Bun.which('microsoft-edge'),
];

// Edge formats with the OS region whatever --lang says, so the app's default-locale formatters are pinned.
const EN_US_SHIM = `(() => {
  for (const name of ['NumberFormat', 'DateTimeFormat']) {
    const Original = Intl[name];
    const Pinned = function (locales, options) { return new Original(locales ?? 'en-US', options); };
    Pinned.prototype = Original.prototype;
    Pinned.supportedLocalesOf = Original.supportedLocalesOf;
    Intl[name] = Pinned;
  }
  for (const [proto, method] of [[Number.prototype, 'toLocaleString'], [Date.prototype, 'toLocaleString'], [Date.prototype, 'toLocaleDateString']]) {
    const original = proto[method];
    proto[method] = function (locales, options) { return original.call(this, locales ?? 'en-US', options); };
  }
})();`;

interface Shot {
  name: string;
  path: string;
  mobile: boolean;
}

function field(value: unknown, key: string): unknown {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }
  const entry: unknown = Reflect.get(value, key);
  return entry;
}

class Cdp {
  readonly #ws: WebSocket;

  readonly #pending = new Map<number, (result: unknown) => void>();

  #nextId = 0;

  private constructor(ws: WebSocket) {
    this.#ws = ws;
    ws.addEventListener('message', (event) => {
      const message: unknown = JSON.parse(String(event.data));
      const id = field(message, 'id');
      const resolve = typeof id === 'number' ? this.#pending.get(id) : undefined;
      if (resolve === undefined || typeof id !== 'number') {
        return;
      }
      this.#pending.delete(id);
      const error = field(message, 'error');
      if (error !== undefined) {
        console.error(error);
      }
      resolve(field(message, 'result'));
    });
  }

  static async connect(url: string): Promise<Cdp> {
    const ws = new WebSocket(url);
    await new Promise((resolve) => {
      ws.addEventListener('open', resolve, { once: true });
    });
    return new Cdp(ws);
  }

  send(method: string, params: object = {}): Promise<unknown> {
    const id = ++this.#nextId;
    return new Promise((resolve) => {
      this.#pending.set(id, resolve);
      this.#ws.send(JSON.stringify({ id, method, params }));
    });
  }

  close(): void {
    this.#ws.close();
  }
}

function findBrowser(): string {
  const found = BROWSERS.find((path): path is string => path != null && path !== '' && existsSync(path));
  if (found === undefined) {
    console.error('no Chrome or Edge found; point GAINZ_BROWSER at one');
    process.exit(1);
  }
  return found;
}

async function seed(dbPath: string): Promise<void> {
  const seeding = Bun.spawn([process.execPath, 'run', 'src/scripts/seed.ts'], {
    env: { ...process.env, GAINZ_DB: dbPath },
    stdout: 'inherit',
    stderr: 'inherit',
  });
  if ((await seeding.exited) !== 0) {
    process.exit(1);
  }
}

// Today's workout half done, in whole kilos: number inputs follow the OS region too.
function stage(db: DB): Shot[] {
  const { workouts, sets } = createWorkoutFacades(db);
  const today = workouts.list(1, 0)[0];
  if (today === undefined) {
    throw new Error('the seed created no workouts');
  }
  sets.list(today.id).forEach((set, index) => {
    sets.update(set.id, { weight: Math.floor(set.weight / 5) * 5, ...(index < 2 ? { done: true } : {}) });
  });

  const exercises = createExerciseFacade(db).list(null, 0);
  const exerciseId = (name: string): number => {
    const exercise = exercises.find((candidate) => candidate.name === name);
    if (exercise === undefined) {
      throw new Error(`the seed created no ${name}`);
    }
    return exercise.id;
  };

  return [
    { name: 'dashboard', path: '/', mobile: false },
    { name: 'workout', path: `/workouts/${today.id}`, mobile: false },
    { name: 'exercise', path: `/exercises/${exerciseId('Back Squat')}`, mobile: false },
    { name: 'mobile-dashboard', path: '/', mobile: true },
    { name: 'mobile-workout', path: `/workouts/${today.id}`, mobile: true },
    { name: 'mobile-exercise', path: `/exercises/${exerciseId('Deadlift')}`, mobile: true },
  ];
}

function freePort(): number {
  const listener = Bun.listen({ hostname: '127.0.0.1', port: 0, socket: { data: () => undefined } });
  const { port } = listener;
  listener.stop(true);
  return port;
}

async function debuggerUrl(port: number): Promise<string> {
  for (let attempt = 0; ; attempt++) {
    try {
      await fetch(`http://127.0.0.1:${port}/json/version`);
      break;
    } catch (err) {
      if (attempt >= 100) {
        throw err;
      }
      await Bun.sleep(100);
    }
  }
  const target: unknown = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
  const url = field(target, 'webSocketDebuggerUrl');
  if (typeof url !== 'string') {
    throw new Error('the browser opened no debuggable tab');
  }
  return url;
}

async function shoot(cdp: Cdp, origin: string, shots: readonly Shot[]): Promise<void> {
  await cdp.send('Page.enable');
  await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: EN_US_SHIM });
  await cdp.send('Emulation.setScrollbarsHidden', { hidden: true });
  await mkdir(OUT_DIR, { recursive: true });

  for (const theme of THEMES) {
    await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: theme }] });
    for (const shot of shots) {
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: shot.mobile ? 390 : 1200,
        height: shot.mobile ? 844 : 820,
        deviceScaleFactor: shot.mobile ? 3 : 2,
        mobile: shot.mobile,
      });
      await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: shot.mobile });
      await cdp.send('Page.navigate', { url: origin + shot.path });
      await Bun.sleep(2500);
      // app.css reserves a scrollbar gutter, which would otherwise show as an empty strip.
      await cdp.send('Runtime.evaluate', { expression: "document.documentElement.style.scrollbarGutter = 'auto'" });
      await Bun.sleep(300);
      const data = field(await cdp.send('Page.captureScreenshot', { format: 'png' }), 'data');
      if (typeof data !== 'string') {
        throw new Error(`no screenshot of ${shot.path}`);
      }
      const file = join(OUT_DIR, `${shot.name}-${theme}.png`);
      await Bun.write(file, Buffer.from(data, 'base64'));
      console.log(`  ${file}`);
    }
  }
}

async function main(): Promise<void> {
  const browserPath = findBrowser();
  const dir = await mkdtemp(join(tmpdir(), 'gainz-screenshots-'));
  const dbPath = join(dir, 'gainz.sqlite');
  const profile = join(dir, 'profile');

  await seed(dbPath);
  const db = openDatabase(dbPath);
  const shots = stage(db);
  const server = startServer(db, 0);
  const port = freePort();
  const browser = Bun.spawn([browserPath, '--headless=new', '--disable-gpu', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank'], {
    stdout: 'ignore',
    stderr: 'ignore',
  });

  try {
    const cdp = await Cdp.connect(await debuggerUrl(port));
    await shoot(cdp, server.url.origin, shots);
    cdp.close();
  } finally {
    browser.kill();
    await browser.exited;
    await server.stop(true);
    db.close();
    await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}

if (import.meta.main) {
  await main();
}

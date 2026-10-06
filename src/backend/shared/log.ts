/**
 * The server's one way to write a log line: `log.<level>(topic, message, …)` writes
 * `<topic> <message>`, then a payload such as a request body on the same line, then an error as
 * `Bun.inspect` renders it — the stack, a `cause` and an `AggregateError`'s inner errors, none of
 * which `err.stack` shows.
 *
 * Under systemd the line is stored by journald, which reads a leading `<N>` as the line's syslog
 * priority (`SyslogLevelPrefix=` defaults to yes) and stores each line of its own, so every line of a
 * multi-line entry, a stack included, carries the prefix. journald mode is chosen when
 * `JOURNAL_STREAM` names stdout's `dev:ino`, as systemd.exec(5) prescribes, and not merely when the
 * variable is set: a terminal launched from a systemd user unit inherits it, and `bun start` there
 * must still print the terminal format.
 */
import { fstatSync } from 'node:fs';

export type LogLevel = 'info' | 'warn' | 'error';

/** One call to `log`, before it is formatted. */
export interface LogEntry {
  level: LogLevel;
  topic: string;
  message: string;
  /** Data the message is about, such as a request body, shown after it on the same line. */
  payload?: string;
  /** Rendered below the line; absent when there is none. */
  error?: unknown;
}

export type LogSink = (entry: LogEntry) => void;

/** How the terminal and journald formats are told apart, and whether the terminal one is colored. */
export interface FormatOptions {
  journald: boolean;
  colors: boolean;
  now: Date;
}

const PRIORITIES: Record<LogLevel, string> = { info: '<6>', warn: '<4>', error: '<3>' };
const LABELS: Record<LogLevel, string> = { info: '', warn: 'WARN ', error: 'ERROR ' };

const RESET = '\x1b[0m';
const GRAY = '\x1b[90m';
const CYAN = '\x1b[36m';
const MAGENTA = '\x1b[35m';
const LEVEL_COLORS: Record<LogLevel, string> = { info: '\x1b[1;32m', warn: '\x1b[1;33m', error: '\x1b[1;31m' };

function paint(color: string, text: string): string {
  return `${color}${text}${RESET}`;
}

function renderError(error: unknown, colors: boolean): string {
  return typeof error === 'string' ? error : Bun.inspect(error, { colors });
}

/** The entry as uncolored text: `<topic> <message>[ <payload>]`, and the error on the lines below. */
export function entryText(entry: LogEntry): string {
  const line = `${entry.topic} ${entry.message}${entry.payload === undefined ? '' : ` ${entry.payload}`}`;
  return entry.error === undefined ? line : `${line}\n${renderError(entry.error, false)}`;
}

/**
 * The entry as it is written: in journald mode each line gets its priority prefix; in a terminal the
 * first line starts with the local time and, for warn and error, the level, and continuation lines
 * go out unchanged. With colors, the terminal format also names info, so every level has a color,
 * and paints the time, the level, the topic and the payload, and lets `Bun.inspect` color the error.
 */
export function formatEntry(entry: LogEntry, options: FormatOptions): string {
  if (options.journald) {
    return entryText(entry)
      .split('\n')
      .map((line) => `${PRIORITIES[entry.level]}${line}`)
      .join('\n');
  }
  const time = [options.now.getHours(), options.now.getMinutes(), options.now.getSeconds()].map((part) => String(part).padStart(2, '0')).join(':');
  if (!options.colors) {
    return `${time} ${LABELS[entry.level]}${entryText(entry)}`;
  }
  let text = `${paint(GRAY, time)} ${paint(LEVEL_COLORS[entry.level], entry.level.toUpperCase().padEnd(5))} ${paint(MAGENTA, entry.topic)} ${entry.message}`;
  if (entry.payload !== undefined) {
    text += ` ${paint(CYAN, entry.payload)}`;
  }
  if (entry.error !== undefined) {
    text += `\n${renderError(entry.error, true)}`;
  }
  return text;
}

/** Whether `value`, a `JOURNAL_STREAM`, is `<dev>:<ino>` and names the file open at `fd`. */
export function isJournalStream(value: string | undefined, fd: number): boolean {
  const match = /^(\d+):(\d+)$/.exec(value ?? '');
  if (match === null) {
    return false;
  }
  try {
    // bigint, because an inode number can exceed what a double holds exactly (it does on Windows).
    const stat = fstatSync(fd, { bigint: true });
    return match[1] === String(stat.dev) && match[2] === String(stat.ino);
  } catch {
    return false;
  }
}

let format: Omit<FormatOptions, 'now'> | undefined;

/**
 * In journald mode every level goes to stdout, because the prefix carries the level and one stream
 * keeps related lines in order; in a terminal info goes to stdout and warn and error to stderr.
 * Colors are for `bun run start:dev` (`GAINZ_DEV=1`) only, and only where Bun would color its own
 * output, so `NO_COLOR` and a redirected stream turn them off.
 */
const defaultSink: LogSink = (entry) => {
  if (format === undefined) {
    const journald = isJournalStream(process.env.JOURNAL_STREAM, 1);
    format = { journald, colors: !journald && process.env.GAINZ_DEV === '1' && Bun.enableANSIColors };
  }
  const out = format.journald || entry.level === 'info' ? process.stdout : process.stderr;
  out.write(`${formatEntry(entry, { ...format, now: new Date() })}\n`);
};

let sink: LogSink = defaultSink;

/** Replaces where entries go, for tests; the returned function restores the previous sink. */
export function setLogSink(next: LogSink): () => void {
  const previous = sink;
  sink = next;
  return () => {
    sink = previous;
  };
}

export const log = {
  info(topic: string, message: string, payload?: string): void {
    sink({ level: 'info', topic, message, payload });
  },
  warn(topic: string, message: string): void {
    sink({ level: 'warn', topic, message });
  },
  error(topic: string, message: string, err?: unknown, payload?: string): void {
    sink({ level: 'error', topic, message, payload, error: err });
  },
};

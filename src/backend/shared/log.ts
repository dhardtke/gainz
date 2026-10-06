/**
 * The server's one way to write a log line: `log.<level>(topic, message, err?)` writes
 * `<topic> <message>`, followed by the error as `Bun.inspect` renders it — the stack, a `cause` and an
 * `AggregateError`'s inner errors, none of which `err.stack` shows.
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
export type LogSink = (level: LogLevel, text: string) => void;

const PRIORITIES: Record<LogLevel, string> = { info: '<6>', warn: '<4>', error: '<3>' };
const LABELS: Record<LogLevel, string> = { info: '', warn: 'WARN ', error: 'ERROR ' };

/**
 * The text as it is written: in journald mode each line gets its priority prefix; in a terminal the
 * first line starts with the local time and, for warn and error, the level, and continuation lines
 * go out unchanged.
 */
export function formatLines(level: LogLevel, text: string, options: { journald: boolean; now: Date }): string {
  if (options.journald) {
    return text
      .split('\n')
      .map((line) => `${PRIORITIES[level]}${line}`)
      .join('\n');
  }
  const time = [options.now.getHours(), options.now.getMinutes(), options.now.getSeconds()].map((part) => String(part).padStart(2, '0')).join(':');
  return `${time} ${LABELS[level]}${text}`;
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

let journald: boolean | undefined;

/**
 * In journald mode every level goes to stdout, because the prefix carries the level and one stream
 * keeps related lines in order; in a terminal info goes to stdout and warn and error to stderr.
 */
const defaultSink: LogSink = (level, text) => {
  journald ??= isJournalStream(process.env.JOURNAL_STREAM, 1);
  const out = journald || level === 'info' ? process.stdout : process.stderr;
  out.write(`${formatLines(level, text, { journald, now: new Date() })}\n`);
};

let sink: LogSink = defaultSink;

/** Replaces where lines go, for tests; the returned function restores the previous sink. */
export function setLogSink(next: LogSink): () => void {
  const previous = sink;
  sink = next;
  return () => {
    sink = previous;
  };
}

export const log = {
  info(topic: string, message: string): void {
    sink('info', `${topic} ${message}`);
  },
  warn(topic: string, message: string): void {
    sink('warn', `${topic} ${message}`);
  },
  error(topic: string, message: string, err?: unknown): void {
    const text = `${topic} ${message}`;
    if (err === undefined) {
      sink('error', text);
      return;
    }
    sink('error', `${text}\n${typeof err === 'string' ? err : Bun.inspect(err, { colors: false })}`);
  },
};

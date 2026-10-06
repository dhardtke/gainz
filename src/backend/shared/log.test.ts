import { describe, expect, test } from 'bun:test';
import { closeSync, fstatSync, openSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { useLogs, useTempDir } from '../testing.ts';
import { formatLines, isJournalStream, log, setLogSink } from './log.ts';

const NOW = new Date(2026, 9, 6, 9, 5, 7);

describe('formatLines', () => {
  test('prefixes every line of a multi-line error with <3> in journald mode', () => {
    expect(formatLines('error', 'http boom\nError: boom\n    at here', { journald: true, now: NOW })).toBe('<3>http boom\n<3>Error: boom\n<3>    at here');
  });

  test('uses <6> for info and <4> for warn in journald mode', () => {
    expect(formatLines('info', 'db applied 001', { journald: true, now: NOW })).toBe('<6>db applied 001');
    expect(formatLines('warn', 'auth wrong password', { journald: true, now: NOW })).toBe('<4>auth wrong password');
  });

  test('starts with the local time in a terminal, naming warn and error on the first line only', () => {
    expect(formatLines('info', 'db applied 001', { journald: false, now: NOW })).toBe('09:05:07 db applied 001');
    expect(formatLines('warn', 'auth wrong password', { journald: false, now: NOW })).toBe('09:05:07 WARN auth wrong password');
    expect(formatLines('error', 'http boom\nError: boom\n    at here', { journald: false, now: NOW })).toBe(
      '09:05:07 ERROR http boom\nError: boom\n    at here',
    );
  });
});

describe('log', () => {
  const logs = useLogs();

  test('writes the topic and the message at the level asked for', () => {
    log.info('db', 'applied 001');
    log.warn('auth', 'wrong password');
    log.error('server', 'failed to start');
    expect(logs()).toEqual([
      { level: 'info', text: 'db applied 001' },
      { level: 'warn', text: 'auth wrong password' },
      { level: 'error', text: 'server failed to start' },
    ]);
  });

  test('appends the stack of an error', () => {
    log.error('http', 'GET /x 500 1ms', new Error('boom'));
    const [entry] = logs();
    expect(entry?.text).toStartWith('http GET /x 500 1ms\n');
    expect(entry?.text).toContain('boom');
    expect(entry?.text).toContain('log.test.ts');
  });

  test("appends an error's cause and an AggregateError's inner errors", () => {
    log.error('db', 'failed', new Error('outer', { cause: new Error('the inner reason') }));
    let parseFailure: unknown;
    try {
      new Bun.Transpiler({ loader: 'ts' }).transformSync('export const oops: = ;');
    } catch (err) {
      parseFailure = err;
    }
    expect(parseFailure).toBeInstanceOf(AggregateError);
    log.error('static', 'could not transpile', parseFailure);
    const [cause, aggregate] = logs();
    expect(cause?.text).toContain('the inner reason');
    expect(aggregate?.text).toContain('Unexpected =');
  });

  test('appends a value that is not an Error', () => {
    log.error('server', 'unhandled rejection', 'just a string');
    expect(logs()).toEqual([{ level: 'error', text: 'server unhandled rejection\njust a string' }]);
  });
});

describe('isJournalStream', () => {
  const dir = useTempDir();

  test('holds only for the dev:ino of the file open at the fd', () => {
    const path = join(dir(), 'stream');
    writeFileSync(path, '');
    const fd = openSync(path, 'r');
    try {
      const st = fstatSync(fd, { bigint: true });
      expect(isJournalStream(`${st.dev}:${st.ino}`, fd)).toBe(true);
      expect(isJournalStream(`${st.dev}:${st.ino + 1n}`, fd)).toBe(false);
      expect(isJournalStream(undefined, fd)).toBe(false);
      expect(isJournalStream('garbage', fd)).toBe(false);
    } finally {
      closeSync(fd);
    }
  });
});

describe('setLogSink', () => {
  test('returns a function that restores the previous sink', () => {
    const first: string[] = [];
    const second: string[] = [];
    const restoreFirst = setLogSink((_level, text) => {
      first.push(text);
    });
    const restoreSecond = setLogSink((_level, text) => {
      second.push(text);
    });
    log.info('a', 'one');
    restoreSecond();
    log.info('b', 'two');
    restoreFirst();
    expect(second).toEqual(['a one']);
    expect(first).toEqual(['b two']);
  });
});

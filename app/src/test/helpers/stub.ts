import * as assert from 'node:assert';
import { afterEach } from 'vitest';
import type { Log } from '../../shell/main/log';

export interface RecordingLog {
  readonly log: Log;
  readonly info: string[];
  readonly warn: string[];
  readonly error: unknown[];
}

export function recordingLog(): RecordingLog {
  const info: string[] = [];
  const warn: string[] = [];
  const error: unknown[] = [];
  return {
    log: {
      info: (message) => info.push(message),
      warn: (message) => warn.push(message),
      error: (failure) => error.push(failure),
    },
    info,
    warn,
    error,
  };
}

export function failOnErrorsLogged(logged: unknown[]): void {
  afterEach(() => {
    assert.deepStrictEqual(logged.splice(0), []);
  });
}

export function takeErrorsLogged(
  logged: unknown[],
  ...expected: RegExp[]
): void {
  const messages = logged
    .splice(0)
    .map((entry) => (entry instanceof Error ? entry.message : String(entry)));
  for (const pattern of expected) {
    assert.ok(
      messages.some((message) => pattern.test(message)),
      `${pattern} in ${JSON.stringify(messages)}`,
    );
  }
  for (const message of messages) {
    assert.ok(
      expected.some((pattern) => pattern.test(message)),
      `unexpected error logged: ${message}`,
    );
  }
}

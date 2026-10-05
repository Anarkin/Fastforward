import type { Log } from '../log';

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

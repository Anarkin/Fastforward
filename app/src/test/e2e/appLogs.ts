import * as fs from 'node:fs';
import * as path from 'node:path';

interface Entry {
  readonly time: number;
  readonly level: string;
  readonly lines: string[];
}

const entryStart = /^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z) \[(\w+)\] /;

const profiles = new Set<string>();

export function rememberProfile(profile: string): void {
  profiles.add(profile);
}

export function errorsIn(log: string, since: number): string[] {
  const entries: Entry[] = [];
  for (const line of log.split('\n')) {
    const start = entryStart.exec(line);
    if (start) {
      entries.push({
        time: Date.parse(start[1] ?? ''),
        level: start[2] ?? '',
        lines: [line],
      });
    } else {
      entries.at(-1)?.lines.push(line);
    }
  }
  return entries
    .filter((entry) => entry.level === 'error' && entry.time >= since)
    .map((entry) => entry.lines.join('\n').trimEnd());
}

export function errorsLoggedSince(since: number): string[] {
  return [...profiles].flatMap((profile) => {
    try {
      return errorsIn(
        fs.readFileSync(path.join(profile, 'logs', 'Fastforward.log'), 'utf8'),
        since,
      );
    } catch {
      return [];
    }
  });
}

export function lastLines(log: string, count: number): string[] {
  return log
    .split('\n')
    .filter((line) => line !== '')
    .slice(-count);
}

export function lastLogged(profile: string, count = 20): string[] {
  try {
    return lastLines(
      fs.readFileSync(path.join(profile, 'logs', 'Fastforward.log'), 'utf8'),
      count,
    );
  } catch {
    return [];
  }
}

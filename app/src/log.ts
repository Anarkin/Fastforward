import * as fs from 'node:fs';
import * as path from 'node:path';

export interface Log {
  info(message: string): void;
  warn(message: string): void;
  error(error: unknown): void;
}

export function fileLog(file: string, echo = false): Log {
  const descriptor = openLogFile(file);
  const write = (level: string, text: string) => {
    const line = `${new Date().toISOString()} [${level}] ${text}\n`;
    try {
      if (descriptor !== undefined) {
        fs.writeSync(descriptor, line);
      }
    } catch {}
    if (echo) {
      process.stdout.write(line);
    }
  };
  return {
    info: (message) => write('info', message),
    warn: (message) => write('warn', message),
    error: (error) => write('error', errorLine(error)),
  };
}

function openLogFile(file: string): number | undefined {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    try {
      fs.renameSync(file, file.replace(/\.log$/, '.previous.log'));
    } catch {}
    return fs.openSync(file, 'a');
  } catch {
    return undefined;
  }
}

export function errorLine(error: unknown): string {
  return error instanceof Error
    ? (error.stack ?? `${error.name}: ${error.message}`)
    : String(error);
}

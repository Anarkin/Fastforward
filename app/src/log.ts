import * as fs from 'node:fs';
import * as path from 'node:path';

export interface Log {
  info(message: string): void;
  warn(message: string): void;
  error(error: Error | string): void;
}

export function fileLog(file: string, echo = false): Log {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  try {
    fs.renameSync(file, file.replace(/\.log$/, '.previous.log'));
  } catch {}
  const descriptor = fs.openSync(file, 'a');
  const write = (level: string, text: string) => {
    const line = `${new Date().toISOString()} [${level}] ${text}\n`;
    fs.writeSync(descriptor, line);
    if (echo) {
      process.stdout.write(line);
    }
  };
  return {
    info: (message) => write('info', message),
    warn: (message) => write('warn', message),
    error: (error) =>
      write('error', error instanceof Error ? errorLine(error) : error),
  };
}

function errorLine(error: Error): string {
  return error.stack ?? `${error.name}: ${error.message}`;
}

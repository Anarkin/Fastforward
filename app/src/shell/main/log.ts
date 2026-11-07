import * as fs from 'node:fs';
import * as path from 'node:path';

export interface Log {
  info(message: string): void;
  warn(message: string): void;
  error(error: unknown): void;
}

export function fileLog(file: string, echo = false): Log {
  const descriptor = openLogFile(file);
  let size = sizeOf(descriptor);
  const cut = () => {
    try {
      cutToNewest(file);
    } catch {}
    size = sizeOf(descriptor);
  };
  const write = (level: string, text: string) => {
    const line = `${new Date().toISOString()} [${level}] ${text}\n`;
    try {
      if (descriptor !== undefined) {
        fs.writeSync(descriptor, line);
        size += Buffer.byteLength(line);
        if (size > largestWhileRunning) {
          cut();
        }
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

const megabyte = 1024 * 1024;
const largestLog = 10 * megabyte;
const keptOnCut = 5 * megabyte;
const largestWhileRunning = 2 * largestLog;

function sizeOf(descriptor: number | undefined): number {
  try {
    return descriptor === undefined ? 0 : fs.fstatSync(descriptor).size;
  } catch {
    return 0;
  }
}

function openLogFile(file: string): number | undefined {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.rmSync(file.replace(/\.log$/, '.previous.log'), { force: true });
    try {
      cutToNewest(file);
    } catch {}
    return fs.openSync(file, 'a');
  } catch {
    return undefined;
  }
}

function cutToNewest(file: string): void {
  const descriptor = fs.openSync(file, 'r');
  let newest: Buffer;
  try {
    const { size } = fs.fstatSync(descriptor);
    if (size <= largestLog) {
      return;
    }
    newest = Buffer.alloc(keptOnCut);
    fs.readSync(descriptor, newest, 0, keptOnCut, size - keptOnCut);
  } finally {
    fs.closeSync(descriptor);
  }
  fs.writeFileSync(file, newest.subarray(newest.indexOf('\n') + 1));
}

export function errorLine(error: unknown): string {
  return error instanceof Error
    ? (error.stack ?? `${error.name}: ${error.message}`)
    : String(error);
}

import type { LibraryHandle } from 'koffi';

export type Native = ReturnType<LibraryHandle['func']>;

export function called(native: Native, ...args: unknown[]): Promise<unknown> {
  return new Promise((resolve, reject) => {
    native.async(...args, (error: unknown, result: unknown) => {
      if (error) {
        reject(
          error instanceof Error ? error : new Error(JSON.stringify(error)),
        );
      } else {
        resolve(result);
      }
    });
  });
}

export function textOf(buffer: Buffer): string {
  const all = buffer.toString('utf16le');
  const end = all.indexOf('\0');
  return end === -1 ? all : all.slice(0, end);
}

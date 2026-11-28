import * as path from 'node:path';
import { fs } from './files';
import { writeAtomically } from './textFiles';
import { realTimer, type Timer } from './timer';

const copyWait = 1000;

export interface RecoveryCopies {
  readonly keep: (key: string, copy: () => unknown) => void;
  readonly drop: (key: string) => void;
  readonly take: (key: string) => unknown;
  readonly flush: () => Promise<void>;
}

const fileOf = (key: string) => `${encodeURIComponent(key)}.json`;

async function copiesLeftIn(folder: string): Promise<Map<string, unknown>> {
  const left = new Map<string, unknown>();
  const names = await fs.promises.readdir(folder).catch(() => []);
  for (const name of names) {
    if (!name.endsWith('.json')) {
      continue;
    }
    try {
      left.set(
        decodeURIComponent(name.slice(0, -'.json'.length)),
        JSON.parse(await fs.promises.readFile(path.join(folder, name), 'utf8')),
      );
    } catch {
      continue;
    }
  }
  return left;
}

export async function recoveryCopies(
  folder: string,
  timer: Timer = realTimer,
  wait = copyWait,
): Promise<RecoveryCopies> {
  const left = await copiesLeftIn(folder);
  const pending = new Map<string, () => unknown>();
  let writing: Promise<void> = Promise.resolve();
  let cancel: (() => void) | undefined;

  const flush = (): Promise<void> => {
    cancel?.();
    cancel = undefined;
    const copies = [...pending].map(([key, copy]) => [key, copy()] as const);
    pending.clear();
    writing = writing.then(async () => {
      if (copies.length > 0) {
        await fs.promises.mkdir(folder, { recursive: true, mode: 0o700 });
      }
      for (const [key, copy] of copies) {
        await writeAtomically(
          path.join(folder, fileOf(key)),
          JSON.stringify(copy),
        ).catch(() => undefined);
      }
    });
    return writing;
  };

  return {
    keep: (key, copy) => {
      left.delete(key);
      pending.set(key, copy);
      cancel ??= timer(() => {
        cancel = undefined;
        void flush();
      }, wait);
    },
    drop: (key) => {
      pending.delete(key);
      left.delete(key);
      writing = writing.then(() =>
        fs.promises.rm(path.join(folder, fileOf(key)), { force: true }),
      );
    },
    take: (key) => {
      const copy = left.get(key);
      left.delete(key);
      return copy;
    },
    flush,
  };
}

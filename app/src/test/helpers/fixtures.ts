import { readDefaults, type Settings } from '../../shell/main/settings';
import { statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Sentence } from '../../lib/shared/sentences';

export function element(
  tagName: string,
  isContentEditable = false,
): EventTarget {
  const target = {
    tagName,
    isContentEditable,
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => true,
  };
  return target;
}

export function posingAsElement(fake: object): Element {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return fake as unknown as Element;
}

export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  what: string,
  timeout = 15_000,
): Promise<void> {
  const deadline = Date.now() + timeout;
  while (!(await condition())) {
    if (Date.now() > deadline) {
      throw new Error(`Timed out waiting for ${what}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

const busyCodes = new Set(['EBUSY', 'EPERM', 'UNKNOWN']);

export async function writeWhenFree(
  file: string,
  content: string,
): Promise<void> {
  await waitFor(() => {
    try {
      writeFileSync(file, content);
      return true;
    } catch (error) {
      if (busyCodes.has(String(Reflect.get(Object(error), 'code')))) {
        return false;
      }
      throw error;
    }
  }, `${file} to be free to write`);
}

export function writeOver(file: string, content: string): void {
  const bytes = Buffer.from(content);
  const size = statSync(file).size;
  if (bytes.length !== size) {
    throw new Error(
      `${file} holds ${size} bytes, so ${bytes.length} can't be written over them without cutting or growing it`,
    );
  }
  writeFileSync(file, bytes, { flag: 'r+' });
}

export async function until(
  condition: () => boolean,
  tries = 2000,
): Promise<void> {
  for (let tried = 0; tried < tries && !condition(); tried++) {
    await new Promise((resolve) => setTimeout(resolve, 1));
  }
  if (!condition()) {
    throw new Error('The condition never held');
  }
}

export function countingReads<T extends object>(
  target: T,
): { readonly counted: T; reads: number } {
  const counter = {
    reads: 0,
    counted: new Proxy(target, {
      get(object, key, receiver) {
        if (typeof key === 'string' && /^\d+$/.test(key)) {
          counter.reads++;
        }
        return Reflect.get(object, key, receiver) as unknown;
      },
    }),
  };
  return counter;
}

export function defaultSettings(): Settings {
  return readDefaults(join(__dirname, '../../shell/main/settings.json'));
}

export const noop = () => {};

export const shownText = (sentence: Sentence) =>
  typeof sentence === 'string'
    ? sentence
    : sentence
        .map((part) => (typeof part === 'string' ? part : part.name))
        .join('');

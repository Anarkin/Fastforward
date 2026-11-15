import { readDefaults, type Settings } from '../../shell/main/settings';
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
  const until = Date.now() + timeout;
  while (!(await condition())) {
    if (Date.now() > until) {
      throw new Error(`Timed out waiting for ${what}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
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

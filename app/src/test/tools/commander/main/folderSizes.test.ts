import * as assert from 'node:assert';
import * as path from 'node:path';
import { suite, test } from 'vitest';
import { FolderSizes } from '../../../../tools/commander/main/folderSizes';
import type { Entry } from '../../../../tools/commander/shared/protocol';

const root = path.resolve('/', 'Downloads');
const at = (...names: string[]) => path.join(root, ...names);

const file = (
  name: string,
  size: number,
  more: Partial<Entry> = {},
): Entry => ({
  name,
  folder: false,
  link: false,
  hidden: false,
  size,
  modified: 0,
  ...more,
});

const folder = (name: string, more: Partial<Entry> = {}): Entry => ({
  name,
  folder: true,
  link: false,
  hidden: false,
  size: undefined,
  modified: 0,
  ...more,
});

const denied = () => Object.assign(new Error('denied'), { code: 'EPERM' });

type Listed = readonly Entry[] | Error;

function sizesOf(listed: Record<string, Listed>) {
  const asked: string[] = [];
  const held = new Map<string, PromiseWithResolvers<void>>();
  let reading = 0;
  let mostAtOnce = 0;
  let changes = 0;
  const list = async (each: string): Promise<readonly Entry[]> => {
    asked.push(each);
    reading++;
    mostAtOnce = Math.max(mostAtOnce, reading);
    try {
      await held.get(each)?.promise;
      await Promise.resolve();
      const found = listed[each];
      if (found === undefined) {
        throw Object.assign(new Error(each), { code: 'ENOENT' });
      }
      if (found instanceof Error) {
        throw found;
      }
      return found;
    } finally {
      reading--;
    }
  };
  const sizes = new FolderSizes(root, list, () => changes++);
  const hold = (each: string) => {
    const holding = Promise.withResolvers<void>();
    held.set(each, holding);
    return () => {
      held.delete(each);
      holding.resolve();
    };
  };
  return {
    sizes,
    asked,
    hold,
    mostAtOnce: () => mostAtOnce,
    changes: () => changes,
  };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

suite('folderSizes', () => {
  test('counts the bytes of the files in a folder asked for and in every folder under it', async () => {
    const { sizes } = sizesOf({
      [at('photos')]: [file('cat.jpg', 3), folder('2024')],
      [at('photos', '2024')]: [file('dog.jpg', 4), folder('empty')],
      [at('photos', '2024', 'empty')]: [],
    });
    sizes.count(['photos']);
    await sizes.idle();
    assert.deepStrictEqual(sizes.of('photos'), {
      bytes: 7,
      counting: false,
      unread: 0,
    });
    assert.strictEqual(sizes.counting, false);
  });

  test('counts no link, neither the file it points to nor what is in the folder it points to', async () => {
    const { sizes, asked } = sizesOf({
      [at('photos')]: [
        file('cat.jpg', 3),
        file('shortcut', 100, { link: true }),
        folder('Application Data', { link: true }),
      ],
      [at('photos', 'Application Data')]: [file('big.bin', 1000)],
    });
    sizes.count(['photos']);
    await sizes.idle();
    assert.deepStrictEqual(sizes.of('photos'), {
      bytes: 3,
      counting: false,
      unread: 0,
    });
    assert.deepStrictEqual(asked, [at('photos')]);
  });

  test('counts the folders under it that could not be read, and leaves a folder asked for that could not be read itself without a size', async () => {
    const { sizes } = sizesOf({
      [at('photos')]: [file('cat.jpg', 2), folder('locked'), folder('gone')],
      [at('photos', 'locked')]: denied(),
      [at('secret')]: denied(),
    });
    sizes.count(['photos', 'secret']);
    await sizes.idle();
    assert.deepStrictEqual(sizes.of('photos'), {
      bytes: 2,
      counting: false,
      unread: 2,
    });
    assert.strictEqual(sizes.of('secret'), undefined);
  });

  test('tells the size counted so far while it counts', async () => {
    const { sizes, hold } = sizesOf({
      [at('photos')]: [file('cat.jpg', 3), folder('2024')],
      [at('photos', '2024')]: [file('dog.jpg', 4)],
    });
    const release = hold(at('photos', '2024'));
    sizes.count(['photos']);
    await tick();
    assert.deepStrictEqual(sizes.of('photos'), {
      bytes: 3,
      counting: true,
      unread: 0,
    });
    assert.strictEqual(sizes.counting, true);
    release();
    await sizes.idle();
    assert.deepStrictEqual(sizes.of('photos'), {
      bytes: 7,
      counting: false,
      unread: 0,
    });
  });

  test('counts a folder once however often it is asked for, while it counts and once it is counted', async () => {
    const { sizes, asked, hold } = sizesOf({
      [at('photos')]: [file('cat.jpg', 3)],
    });
    const release = hold(at('photos'));
    sizes.count(['photos', 'photos']);
    sizes.count(['photos']);
    release();
    await sizes.idle();
    sizes.count(['photos']);
    await sizes.idle();
    assert.deepStrictEqual(asked, [at('photos')]);
  });

  test('starts with the folders in the order asked for', async () => {
    const { sizes, asked } = sizesOf({
      [at('a')]: [folder('deep')],
      [at('a', 'deep')]: [],
      [at('b')]: [],
      [at('c')]: [],
    });
    sizes.count(['a', 'b', 'c']);
    await sizes.idle();
    assert.deepStrictEqual(asked.slice(0, 3), [at('a'), at('b'), at('c')]);
  });

  test('reads at most eight folders at once', async () => {
    const names = Array.from({ length: 20 }, (_, index) => `folder${index}`);
    const { sizes, asked, mostAtOnce } = sizesOf({
      [at('photos')]: names.map((name) => folder(name)),
      ...Object.fromEntries(
        names.map((name) => [at('photos', name), [file('a.txt', 1)]]),
      ),
    });
    sizes.count(['photos']);
    await sizes.idle();
    assert.strictEqual(asked.length, 21);
    assert.strictEqual(mostAtOnce(), 8);
    assert.strictEqual(sizes.of('photos')?.bytes, 20);
  });

  test('stops counting when told, forgetting the folders it was counting and keeping those it counted, and counts them afresh once asked again', async () => {
    const { sizes, hold, asked } = sizesOf({
      [at('done')]: [file('a.txt', 1)],
      [at('slow')]: [file('b.txt', 2), folder('deeper')],
      [at('slow', 'deeper')]: [file('c.txt', 3)],
    });
    sizes.count(['done']);
    await sizes.idle();
    const release = hold(at('slow'));
    sizes.count(['slow']);
    await tick();
    sizes.stop();
    release();
    await sizes.idle();
    assert.deepStrictEqual(sizes.of('done'), {
      bytes: 1,
      counting: false,
      unread: 0,
    });
    assert.strictEqual(sizes.of('slow'), undefined);
    assert.strictEqual(sizes.counting, false);
    assert.deepStrictEqual(asked, [at('done'), at('slow')]);

    sizes.count(['slow']);
    await sizes.idle();
    assert.deepStrictEqual(sizes.of('slow'), {
      bytes: 5,
      counting: false,
      unread: 0,
    });
  });

  test('takes the folders whose size changed since they were last taken, those forgotten too', async () => {
    const { sizes, hold } = sizesOf({
      [at('a')]: [file('a.txt', 1)],
      [at('b')]: [file('b.txt', 2)],
    });
    sizes.count(['a']);
    await sizes.idle();
    assert.deepStrictEqual(sizes.take(), ['a']);
    assert.deepStrictEqual(sizes.take(), []);
    const release = hold(at('b'));
    sizes.count(['b']);
    sizes.stop();
    release();
    await sizes.idle();
    assert.deepStrictEqual(sizes.take(), ['b']);
  });

  test('tells of every change of a size', async () => {
    const { sizes, changes } = sizesOf({
      [at('a')]: [file('a.txt', 1), folder('b')],
      [at('a', 'b')]: [file('b.txt', 2)],
    });
    sizes.count(['a']);
    await sizes.idle();
    assert.ok(changes() >= 2);
  });

  test('reads and tells nothing more once closed', async () => {
    const { sizes, hold, asked, changes } = sizesOf({
      [at('slow')]: [folder('deeper')],
      [at('slow', 'deeper')]: [],
    });
    const release = hold(at('slow'));
    sizes.count(['slow']);
    await tick();
    sizes.close();
    const before = changes();
    release();
    await sizes.idle();
    sizes.count(['slow']);
    await sizes.idle();
    assert.deepStrictEqual(asked, [at('slow')]);
    assert.strictEqual(changes(), before);
  });
});

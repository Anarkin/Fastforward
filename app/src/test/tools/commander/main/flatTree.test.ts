import * as assert from 'node:assert';
import * as path from 'node:path';
import { suite, test } from 'vitest';
import { FlatTree } from '../../../../tools/commander/main/flatTree';
import type { Entry } from '../../../../tools/commander/shared/protocol';

const root = path.resolve('/', 'Downloads');
const at = (...names: string[]) => path.join(root, ...names);
const under = (...names: string[]) =>
  names.map((name) => `${name}${path.sep}`).join('');

const file = (name: string, more: Partial<Entry> = {}): Entry => ({
  name,
  folder: false,
  link: false,
  hidden: false,
  size: 1,
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

type Listed = readonly Entry[] | Error;

function tree(listed: Record<string, Listed>) {
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
  const flat = new FlatTree(root, list, () => changes++);
  const hold = (each: string) => {
    const holding = Promise.withResolvers<void>();
    held.set(each, holding);
    return () => {
      held.delete(each);
      holding.resolve();
    };
  };
  const taken = () =>
    flat
      .take()
      .map(
        (each) =>
          `${each.under || '.'}: ${each.entries.map((entry) => `${entry.name}${entry.hidden ? ' (hidden)' : ''}`).join(' ')}`,
      )
      .toSorted();
  return {
    flat,
    asked,
    hold,
    taken,
    mostAtOnce: () => mostAtOnce,
    changes: () => changes,
    listed,
  };
}

suite('flatTree', () => {
  test('reads the files of every folder under the root, without the folders', async () => {
    const { flat, taken } = tree({
      [root]: [file('setup.exe'), folder('photos')],
      [at('photos')]: [file('cat.jpg'), folder('2024')],
      [at('photos', '2024')]: [file('dog.jpg')],
    });
    flat.start();
    await flat.idle();
    assert.deepStrictEqual(taken(), [
      `.: setup.exe`,
      `${under('photos', '2024')}: dog.jpg`,
      `${under('photos')}: cat.jpg`,
    ]);
  });

  test('finds a file by the folder under the root before its name', async () => {
    const { flat } = tree({
      [root]: [folder('photos')],
      [at('photos')]: [file('cat.jpg')],
    });
    flat.start();
    await flat.idle();
    assert.strictEqual(flat.file(`${under('photos')}cat.jpg`)?.name, 'cat.jpg');
    assert.strictEqual(flat.file('cat.jpg'), undefined);
    assert.strictEqual(flat.file(under('photos')), undefined);
  });

  test('lists a link to a file but goes into no link to a folder', async () => {
    const { flat, asked, taken } = tree({
      [root]: [
        file('shortcut', { link: true }),
        folder('Application Data', { link: true }),
      ],
      [at('Application Data')]: [file('inside.txt')],
    });
    flat.start();
    await flat.idle();
    assert.deepStrictEqual(asked, [root]);
    assert.deepStrictEqual(taken(), ['.: shortcut']);
  });

  test('counts the folders read and those that could not be, until reading is done', async () => {
    const { flat, hold } = tree({
      [root]: [folder('open'), folder('locked')],
      [at('open')]: [file('a.txt')],
      [at('locked')]: Object.assign(new Error('denied'), { code: 'EPERM' }),
    });
    const release = hold(at('open'));
    flat.start();
    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.deepStrictEqual(flat.progress, {
      reading: true,
      stopped: false,
      folders: 1,
      failed: 1,
    });
    release();
    await flat.idle();
    assert.deepStrictEqual(flat.progress, {
      reading: false,
      stopped: false,
      folders: 2,
      failed: 1,
    });
  });

  test('hides the files of a hidden folder and of the folders in it', async () => {
    const { flat, taken } = tree({
      [root]: [folder('.cache', { hidden: true }), file('shown.txt')],
      [at('.cache')]: [file('a.bin'), folder('deeper')],
      [at('.cache', 'deeper')]: [file('b.bin')],
    });
    flat.start();
    await flat.idle();
    assert.deepStrictEqual(taken(), [
      '.: shown.txt',
      `${under('.cache')}: a.bin (hidden)`,
      `${under('.cache', 'deeper')}: b.bin (hidden)`,
    ]);
  });

  test('reads at most eight folders at once', async () => {
    const names = Array.from({ length: 20 }, (_, index) => `folder${index}`);
    const { flat, asked, mostAtOnce } = tree({
      [root]: names.map((name) => folder(name)),
      ...Object.fromEntries(names.map((name) => [at(name), [file('a.txt')]])),
    });
    flat.start();
    await flat.idle();
    assert.strictEqual(asked.length, 21);
    assert.strictEqual(mostAtOnce(), 8);
  });

  test('reads the folders nearer the root first', async () => {
    const { flat, asked } = tree({
      [root]: [folder('a'), folder('b')],
      [at('a')]: [folder('deep')],
      [at('a', 'deep')]: [],
      [at('b')]: [],
    });
    flat.start();
    await flat.idle();
    assert.deepStrictEqual(asked, [root, at('a'), at('b'), at('a', 'deep')]);
  });

  test('stops reading when told, keeping what it read and leaving what it was reading', async () => {
    const { flat, hold, taken } = tree({
      [root]: [file('top.txt'), folder('slow')],
      [at('slow')]: [file('late.txt'), folder('deeper')],
      [at('slow', 'deeper')]: [file('never.txt')],
    });
    const release = hold(at('slow'));
    flat.start();
    await new Promise((resolve) => setTimeout(resolve, 0));
    flat.stop();
    release();
    await flat.idle();
    assert.deepStrictEqual(taken(), ['.: top.txt']);
    assert.deepStrictEqual(flat.progress, {
      reading: false,
      stopped: true,
      folders: 1,
      failed: 0,
    });
  });

  test('takes only the folders changed since it was last taken, and all once asked again', async () => {
    const { flat, taken, listed } = tree({
      [root]: [file('top.txt'), folder('photos')],
      [at('photos')]: [file('cat.jpg')],
    });
    flat.start();
    await flat.idle();
    taken();
    assert.deepStrictEqual(taken(), []);
    listed[at('photos')] = [file('cat.jpg'), file('dog.jpg')];
    flat.changed(path.join('photos', 'dog.jpg'));
    await flat.idle();
    assert.deepStrictEqual(taken(), [`${under('photos')}: cat.jpg dog.jpg`]);
    flat.resend();
    assert.deepStrictEqual(taken(), [
      '.: top.txt',
      `${under('photos')}: cat.jpg dog.jpg`,
    ]);
  });

  test('tells of every change of what it read or of its progress', async () => {
    const { flat, changes, listed } = tree({
      [root]: [file('top.txt')],
    });
    flat.start();
    await flat.idle();
    const before = changes();
    assert.ok(before > 0);
    listed[root] = [file('top.txt'), file('new.txt')];
    flat.changed('new.txt');
    await flat.idle();
    assert.ok(changes() > before);
  });

  test('reads a folder again when something in it changes', async () => {
    const { flat, taken, listed, asked } = tree({
      [root]: [file('old.txt')],
    });
    flat.start();
    await flat.idle();
    taken();
    listed[root] = [file('new.txt')];
    flat.changed('old.txt');
    await flat.idle();
    assert.deepStrictEqual(asked, [root, root]);
    assert.deepStrictEqual(taken(), ['.: new.txt']);
    assert.strictEqual(flat.file('old.txt'), undefined);
    assert.strictEqual(flat.file('new.txt')?.name, 'new.txt');
  });

  test('takes nothing and tells of nothing when a folder read again lists as it did, as reading a file for its icon changes only when it was read last, and taking in a folder of 20,000 files stalled the page', async () => {
    const { flat, taken, listed, asked, changes } = tree({
      [root]: [file('a.exe'), folder('inner')],
      [at('inner')]: [file('b.txt')],
    });
    flat.start();
    await flat.idle();
    taken();
    const before = changes();

    listed[root] = [file('a.exe'), folder('inner')];
    flat.changed('a.exe');
    await flat.idle();

    assert.deepStrictEqual(asked, [root, at('inner'), root]);
    assert.deepStrictEqual(taken(), []);
    assert.strictEqual(changes(), before);
  });

  test('reads every folder it read again once it cannot be told what changed, taking only those that changed', async () => {
    const { flat, taken, listed, asked } = tree({
      [root]: [folder('photos')],
      [at('photos')]: [file('cat.jpg')],
    });
    flat.start();
    await flat.idle();
    taken();
    listed[at('photos')] = [file('dog.jpg')];
    flat.changedAll();
    await flat.idle();
    assert.deepStrictEqual(asked.toSorted(), [
      root,
      root,
      at('photos'),
      at('photos'),
    ]);
    assert.deepStrictEqual(taken(), [`${under('photos')}: dog.jpg`]);
  });

  test('reads a folder made under one it read', async () => {
    const { flat, taken, listed } = tree({
      [root]: [file('top.txt')],
    });
    flat.start();
    await flat.idle();
    taken();
    listed[root] = [file('top.txt'), folder('made')];
    listed[at('made')] = [folder('deeper')];
    listed[at('made', 'deeper')] = [file('inside.txt')];
    flat.changed('made');
    await flat.idle();
    assert.deepStrictEqual(taken(), [
      '.: top.txt',
      `${under('made')}: `,
      `${under('made', 'deeper')}: inside.txt`,
    ]);
    assert.strictEqual(flat.progress.folders, 3);
    assert.strictEqual(flat.progress.reading, false);
  });

  test('drops a folder removed, and the folders in it', async () => {
    const { flat, taken, listed } = tree({
      [root]: [file('top.txt'), folder('gone')],
      [at('gone')]: [file('a.txt'), folder('deeper')],
      [at('gone', 'deeper')]: [file('b.txt')],
    });
    flat.start();
    await flat.idle();
    taken();
    listed[root] = [file('top.txt')];
    delete listed[at('gone')];
    delete listed[at('gone', 'deeper')];
    flat.changed('gone');
    await flat.idle();
    assert.deepStrictEqual(taken(), [
      '.: top.txt',
      `${under('gone')}: `,
      `${under('gone', 'deeper')}: `,
    ]);
    assert.strictEqual(flat.file(`${under('gone', 'deeper')}b.txt`), undefined);
    assert.deepStrictEqual(flat.progress, {
      reading: false,
      stopped: false,
      folders: 1,
      failed: 0,
    });
  });

  test('drops a folder that can no longer be read once something in it changes', async () => {
    const { flat, taken, listed } = tree({
      [root]: [folder('photos')],
      [at('photos')]: [file('cat.jpg')],
    });
    flat.start();
    await flat.idle();
    taken();
    delete listed[at('photos')];
    flat.changed(path.join('photos', 'cat.jpg'));
    await flat.idle();
    assert.deepStrictEqual(taken(), [`${under('photos')}: `]);
    assert.strictEqual(flat.progress.failed, 0);
  });

  test('reads a folder once more when it changes while being read', async () => {
    const { flat, hold, taken, listed, asked } = tree({
      [root]: [file('first.txt')],
    });
    flat.start();
    await flat.idle();
    taken();
    const release = hold(root);
    flat.changed('first.txt');
    await new Promise((resolve) => setTimeout(resolve, 0));
    flat.changed('first.txt');
    flat.changed('first.txt');
    listed[root] = [file('second.txt')];
    release();
    await flat.idle();
    assert.deepStrictEqual(asked, [root, root, root]);
    assert.deepStrictEqual(taken(), ['.: second.txt']);
  });

  test('leaves changes in folders it has not read yet to the reading', async () => {
    const { flat, hold, asked } = tree({
      [root]: [folder('slow')],
      [at('slow')]: [folder('later')],
      [at('slow', 'later')]: [file('a.txt')],
    });
    const release = hold(at('slow'));
    flat.start();
    await new Promise((resolve) => setTimeout(resolve, 0));
    flat.changed(path.join('slow', 'later', 'a.txt'));
    release();
    await flat.idle();
    assert.deepStrictEqual(asked, [root, at('slow'), at('slow', 'later')]);
  });

  test('reads a folder again once a change in it comes while it is first read', async () => {
    const { flat, hold, asked, listed, taken } = tree({
      [root]: [folder('slow')],
      [at('slow')]: [file('a.txt')],
    });
    const release = hold(at('slow'));
    flat.start();
    await new Promise((resolve) => setTimeout(resolve, 0));
    listed[at('slow')] = [file('a.txt'), file('new.txt')];
    flat.changed(path.join('slow', 'new.txt'));
    release();
    await flat.idle();
    assert.deepStrictEqual(asked, [root, at('slow'), at('slow')]);
    assert.deepStrictEqual(taken(), ['.: ', `${under('slow')}: a.txt new.txt`]);
  });

  test('counts no failure for a folder removed with its parent while being read', async () => {
    const { flat, hold, listed } = tree({
      [root]: [folder('slow'), folder('gone')],
      [at('slow')]: [],
      [at('gone')]: [folder('a'), folder('b')],
      [at('gone', 'a')]: [],
      [at('gone', 'b')]: [],
    });
    const release = hold(at('gone', 'a'));
    flat.start();
    await new Promise((resolve) => setTimeout(resolve, 0));
    listed[root] = [folder('slow')];
    delete listed[at('gone')];
    delete listed[at('gone', 'a')];
    delete listed[at('gone', 'b')];
    flat.changed('gone');
    release();
    await flat.idle();
    assert.deepStrictEqual(flat.progress, {
      reading: false,
      stopped: false,
      folders: 2,
      failed: 0,
    });
  });

  test('reads nothing and tells of nothing once closed', async () => {
    const { flat, hold, taken, changes } = tree({
      [root]: [file('top.txt')],
    });
    const release = hold(root);
    flat.start();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const before = changes();
    flat.close();
    release();
    await flat.idle();
    assert.deepStrictEqual(taken(), []);
    assert.strictEqual(changes(), before);
  });
});

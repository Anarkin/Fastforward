import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { plainSearch } from '../../../../../lib/shared/searchOptions';
import {
  FlatLists,
  type FlatWorker,
} from '../../../../../tools/commander/page/flatLists';
import { FlatSorter } from '../../../../../tools/commander/page/flatSorter';
import type {
  FlatChoices,
  FromFlatWorker,
} from '../../../../../tools/commander/page/flatMessages';
import { noFileColors } from '../../../../../lib/page/fileColors';
import type { Entry } from '../../../../../tools/commander/shared/protocol';

const file = (name: string): Entry => ({
  name,
  folder: false,
  link: false,
  hidden: false,
  size: 0,
  modified: 0,
});

const choices: FlatChoices = {
  sort: { column: 'name', descending: false, groupByColor: false },
  showHidden: true,
  fileColors: noFileColors,
  query: '',
  options: plainSearch,
};

interface Made {
  readonly fail: (error: Error) => void;
  readonly terminated: () => boolean;
}

function failingLists() {
  const pending: (() => void)[] = [];
  const made: Made[] = [];
  const reported: unknown[] = [];
  const create = (): FlatWorker => {
    const answered: ((event: { readonly data: FromFlatWorker }) => void)[] = [];
    const failed: ((event: { readonly error: unknown }) => void)[] = [];
    let terminated = false;
    const sorter = new FlatSorter(
      (answer) => {
        if (!terminated) {
          for (const listener of answered) {
            listener({ data: answer });
          }
        }
      },
      (run) => pending.push(run),
    );
    made.push({
      fail: (error) => {
        for (const listener of failed) {
          listener({ error });
        }
      },
      terminated: () => terminated,
    });
    return {
      postMessage: (message) => sorter.receive(message),
      onAnswer: (listener) => answered.push(listener),
      onError: (listener) => failed.push(listener),
      terminate: () => {
        terminated = true;
      },
    };
  };
  const flat = new FlatLists(
    create,
    () => undefined,
    { now: () => 0, later: (run) => run() },
    (error) => reported.push(error),
  );
  const sort = () => {
    for (const run of pending.splice(0)) {
      run();
    }
  };
  const keys = (pane: string, walk: number) =>
    flat.built(pane, walk)?.rows.map((row) => row.key);
  return { flat, made, reported, sort, keys };
}

suite('The rows of flat views, their worker failing', () => {
  test('replaces a worker that failed by one told every file each flat view holds, so the views sort again rather than freezing on the rows they had, and reports why it failed, as nothing else would', () => {
    const { flat, made, reported, sort, keys } = failingLists();
    flat.ensure('a', 1, true, choices);
    flat.ensure('b', 4, false, choices);
    flat.files('a', 1, [
      { under: '', entries: [file('b.txt'), file('a.txt')] },
      { under: 'sub/', entries: [file('c.txt')] },
    ]);
    flat.files('b', 4, [{ under: '', entries: [file('x.txt')] }]);
    sort();
    flat.files('a', 1, [{ under: 'sub/', entries: [file('d.txt')] }]);
    const error = new Error('the sorter failed');

    made[0]?.fail(error);
    flat.files('a', 1, [{ under: 'more/', entries: [file('e.txt')] }]);
    sort();

    assert.deepStrictEqual(reported, [error]);
    assert.strictEqual(made.length, 2);
    assert.ok(made[0]?.terminated());
    assert.deepStrictEqual(keys('a', 1), [
      '..',
      'a.txt',
      'b.txt',
      'sub/d.txt',
      'more/e.txt',
    ]);
    assert.strictEqual(flat.built('a', 1)?.complete, true);
    assert.deepStrictEqual(keys('b', 4), ['x.txt']);
  });

  test('replaces no worker that failed again before it sorted anything, as one told the same files fails on them again, while a walk started later gets a worker of its own', () => {
    const { flat, made, reported, sort, keys } = failingLists();
    flat.ensure('a', 1, false, choices);
    flat.files('a', 1, [{ under: '', entries: [file('a.txt')] }]);
    made[0]?.fail(new Error('first'));
    made[1]?.fail(new Error('again'));

    assert.strictEqual(made.length, 2);
    assert.strictEqual(reported.length, 2);

    flat.ensure('a', 2, false, choices);
    flat.files('a', 2, [{ under: '', entries: [file('b.txt')] }]);
    sort();

    assert.strictEqual(made.length, 3);
    assert.deepStrictEqual(keys('a', 2), ['b.txt']);
  });
});

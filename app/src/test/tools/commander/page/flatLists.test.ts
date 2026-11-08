import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  FlatLists,
  type FlatWorker,
} from '../../../../tools/commander/page/flatLists';
import { FlatSorter } from '../../../../tools/commander/page/flatOrder';
import type {
  FlatChoices,
  FromFlatWorker,
  ToFlatWorker,
} from '../../../../tools/commander/page/flatMessages';
import { noFileColors } from '../../../../tools/commander/page/fileColors';
import type { Entry } from '../../../../tools/commander/shared/protocol';

const file = (name: string, extra: Partial<Entry> = {}): Entry => ({
  name,
  folder: false,
  link: false,
  hidden: false,
  size: 0,
  modified: 0,
  ...extra,
});

const choices: FlatChoices = {
  sort: { column: 'name', descending: false, groupByColor: false },
  showHidden: true,
  fileColors: noFileColors,
  query: '',
};

function lists() {
  const told: ToFlatWorker[] = [];
  const listeners: ((event: { readonly data: FromFlatWorker }) => void)[] = [];
  const pending: (() => void)[] = [];
  const sorter = new FlatSorter(
    (answer) => {
      for (const listener of listeners) {
        listener({ data: answer });
      }
    },
    (run) => pending.push(run),
  );
  let made = 0;
  const worker: FlatWorker = {
    postMessage: (message) => {
      told.push(message);
      sorter.receive(message);
    },
    addEventListener: (_type, listener) => listeners.push(listener),
  };
  const clock = { now: 1000 };
  const timers: { at: number; run: () => void }[] = [];
  const built: string[] = [];
  const flat = new FlatLists(
    () => {
      made++;
      return worker;
    },
    (pane) => built.push(pane),
    {
      now: () => clock.now,
      later: (run, wait) => timers.push({ at: clock.now + wait, run }),
    },
  );
  const sort = () => {
    for (const run of pending.splice(0)) {
      run();
    }
  };
  const pass = (millis: number) => {
    clock.now += millis;
    for (const timer of timers.filter((each) => each.at <= clock.now)) {
      timers.splice(timers.indexOf(timer), 1);
      timer.run();
    }
  };
  const keys = (pane: string, walk: number) =>
    flat.built(pane, walk)?.rows.map((row) => row.key);
  return {
    flat,
    told,
    built,
    sort,
    pass,
    keys,
    made: () => made,
  };
}

suite('The rows of flat views', () => {
  test('builds the rows of the files in the order the worker sorts them, the parent first', () => {
    const { flat, sort, keys, built, made } = lists();
    assert.strictEqual(made(), 0);

    flat.ensure('a', 1, true, choices);
    flat.files('a', 1, [
      { under: '', entries: [file('b.txt'), file('a.txt')] },
      { under: 'sub/', entries: [file('c.txt')] },
    ]);
    sort();

    assert.deepStrictEqual(keys('a', 1), ['..', 'a.txt', 'b.txt', 'sub/c.txt']);
    assert.deepStrictEqual(built, ['a']);
    assert.strictEqual(made(), 1);
    assert.strictEqual(flat.built('a', 2), undefined);
  });

  test('gives the rows the folder they are in and the parts of their name', () => {
    const { flat, sort } = lists();
    flat.ensure('a', 1, false, choices);
    flat.files('a', 1, [{ under: 'sub/', entries: [file('notes.txt')] }]);
    sort();

    const [row] = flat.built('a', 1)?.rows ?? [];
    assert.deepStrictEqual(
      { ...row, entry: row.entry?.name },
      {
        key: 'sub/notes.txt',
        entry: 'notes.txt',
        base: 'notes',
        extension: 'txt',
        repository: false,
        under: 'sub/',
      },
    );
  });

  test('replaces the files of a folder told again', () => {
    const { flat, sort, keys, pass } = lists();
    flat.ensure('a', 1, false, choices);
    flat.files('a', 1, [
      { under: '', entries: [file('top.txt')] },
      { under: 'sub/', entries: [file('a.txt'), file('b.txt')] },
    ]);
    sort();

    flat.files('a', 1, [{ under: 'sub/', entries: [file('c.txt')] }]);
    sort();
    pass(100);

    assert.deepStrictEqual(keys('a', 1), ['sub/c.txt', 'top.txt']);
  });

  test('builds the rows again no sooner than a tenth of a second after it last did, from the latest order', () => {
    const { flat, sort, keys, pass } = lists();
    flat.ensure('a', 1, false, choices);
    flat.files('a', 1, [{ under: '', entries: [file('a.txt')] }]);
    sort();

    flat.files('a', 1, [{ under: 'one/', entries: [file('b.txt')] }]);
    sort();
    flat.files('a', 1, [{ under: 'two/', entries: [file('c.txt')] }]);
    sort();
    assert.deepStrictEqual(keys('a', 1), ['a.txt']);

    pass(99);
    assert.deepStrictEqual(keys('a', 1), ['a.txt']);
    pass(1);
    assert.deepStrictEqual(keys('a', 1), ['a.txt', 'one/b.txt', 'two/c.txt']);
  });

  test('tells the worker of the choices only once they change', () => {
    const { flat, told } = lists();
    flat.ensure('a', 1, false, choices);
    flat.ensure('a', 1, false, { ...choices });
    flat.ensure('a', 1, false, { ...choices, query: 'x' });

    assert.deepStrictEqual(
      told.map((message) => message.type),
      ['start', 'choose'],
    );
  });

  test('keeps the rows the query filters with the query', () => {
    const { flat, sort } = lists();
    flat.ensure('a', 1, true, { ...choices, query: 'cat' });
    flat.files('a', 1, [
      { under: '', entries: [file('cat.jpg'), file('dog.jpg')] },
    ]);
    sort();

    const shown = flat.built('a', 1)?.shown;
    assert.strictEqual(shown?.query, 'cat');
    assert.deepStrictEqual(
      shown.rows.map((row) => row.key),
      ['..', 'cat.jpg'],
    );
  });

  test('starts again for another walk, leaving the files of the earlier one', () => {
    const { flat, sort, keys } = lists();
    flat.ensure('a', 1, false, choices);
    flat.files('a', 1, [{ under: '', entries: [file('old.txt')] }]);
    sort();

    flat.ensure('a', 2, false, choices);
    flat.files('a', 1, [{ under: '', entries: [file('late.txt')] }]);
    flat.files('a', 2, [{ under: '', entries: [file('new.txt')] }]);
    sort();

    assert.deepStrictEqual(keys('a', 2), ['new.txt']);
    assert.strictEqual(flat.built('a', 1), undefined);
  });

  test('forgets a pane dropped, telling the worker', () => {
    const { flat, sort, told } = lists();
    flat.ensure('a', 1, false, choices);
    flat.files('a', 1, [{ under: '', entries: [file('a.txt')] }]);
    sort();

    flat.drop('a');
    flat.drop('a');

    assert.strictEqual(flat.built('a', 1), undefined);
    assert.deepStrictEqual(told.at(-1), { type: 'drop', pane: 'a' });
    assert.strictEqual(
      told.filter((message) => message.type === 'drop').length,
      1,
    );
    assert.deepStrictEqual(flat.panes(), []);
  });
});

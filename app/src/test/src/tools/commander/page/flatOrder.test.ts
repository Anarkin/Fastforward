import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  FlatOrder,
  FlatSorter,
  type FlatChoices,
} from '../../../../../tools/commander/page/flatOrder';
import type {
  FromFlatWorker,
  ToFlatWorker,
} from '../../../../../tools/commander/page/flatMessages';
import {
  fileColorsOf,
  noFileColors,
} from '../../../../../tools/commander/page/fileColors';
import type { Entry } from '../../../../../tools/commander/shared/protocol';

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

function ordered(choose: Partial<FlatChoices> = {}) {
  const order = new FlatOrder({ ...choices, ...choose });
  const keys: string[] = [];
  const put = (
    folders: Record<string, readonly Entry[]>,
    freed: readonly number[] = [],
  ) => {
    const slotted = Object.entries(folders).map(([under, entries]) => ({
      under,
      entries,
      slots: entries.map((entry) => keys.push(`${under}${entry.name}`) - 1),
    }));
    order.put(slotted, freed);
    return slotted.map((each) => each.slots);
  };
  const named = (slots: Uint32Array | undefined) =>
    slots === undefined ? undefined : [...slots].map((slot) => keys[slot]);
  const result = () => {
    const { order: all, shown, query } = order.result();
    return { all: named(all), shown: named(shown), query };
  };
  return { order, put, result };
}

suite('The order of the files of a flat view', () => {
  test('sorts by name, the files of one name together, by the folder they are in', () => {
    const { put, result } = ordered();
    put({
      '': [file('b.txt'), file('a.txt')],
      'photos/': [file('a.txt'), file('c.jpg')],
      'Docs/': [file('a.txt')],
    });

    assert.deepStrictEqual(result().all, [
      'a.txt',
      'Docs/a.txt',
      'photos/a.txt',
      'b.txt',
      'photos/c.jpg',
    ]);
  });

  test('sorts by extension, the column the side sorts by, either way', () => {
    const { order, put, result } = ordered({
      sort: { column: 'extension', descending: false, groupByColor: false },
    });
    put({ '': [file('z.md'), file('a.txt')], 'sub/': [file('m.css')] });

    assert.deepStrictEqual(result().all, ['sub/m.css', 'z.md', 'a.txt']);
    order.choose({
      ...choices,
      sort: { column: 'extension', descending: true, groupByColor: false },
    });
    assert.deepStrictEqual(result().all, ['a.txt', 'z.md', 'sub/m.css']);
  });

  test('groups the files by color when the side does', () => {
    const fileColors = fileColorsOf([
      { extensions: ['md'], colors: { light: 'red', dark: 'red' } },
    ]);
    const { put, result } = ordered({
      sort: { column: 'name', descending: false, groupByColor: true },
      fileColors,
    });
    put({ '': [file('a.txt'), file('z.md')], 'sub/': [file('b.md')] });

    assert.deepStrictEqual(result().all, ['sub/b.md', 'z.md', 'a.txt']);
  });

  test('leaves out the hidden files until they are shown', () => {
    const { order, put, result } = ordered({ showHidden: false });
    put({
      '': [file('shown.txt'), file('secret.txt', { hidden: true })],
    });

    assert.deepStrictEqual(result().all, ['shown.txt']);
    order.choose({ ...choices, showHidden: true });
    assert.deepStrictEqual(result().all, ['secret.txt', 'shown.txt']);
  });

  test('puts the files that come later in their place, and takes out those of a folder read again', () => {
    const { put, result } = ordered();
    const [, photos] = put({
      '': [file('m.txt')],
      'photos/': [file('a.jpg'), file('z.jpg')],
    });
    result();

    put(
      {
        'photos/': [file('b.jpg')],
        'later/': [file('n.txt'), file('a.txt')],
      },
      photos,
    );

    assert.deepStrictEqual(result().all, [
      'later/a.txt',
      'photos/b.jpg',
      'm.txt',
      'later/n.txt',
    ]);
  });

  test('keeps the hidden files that come later out until they are shown', () => {
    const { put, result } = ordered({ showHidden: false });
    put({ '': [file('a.txt')] });
    result();

    put({ 'cache/': [file('b.bin', { hidden: true }), file('c.txt')] });

    assert.deepStrictEqual(result().all, ['a.txt', 'cache/c.txt']);
  });

  test('filters by every word of the query anywhere in the name of a file, not in the folder it is in, keeping the order', () => {
    const { order, put, result } = ordered();
    put({
      '': [file('test.ts'), file('main.ts')],
      'src/': [file('main.test.ts'), file('main.ts')],
    });

    assert.deepStrictEqual(result().shown, undefined);
    order.choose({ ...choices, query: 'MAIN test' });
    assert.deepStrictEqual(result(), {
      all: ['main.ts', 'src/main.ts', 'src/main.test.ts', 'test.ts'],
      shown: ['src/main.test.ts'],
      query: 'MAIN test',
    });
    order.choose({ ...choices, query: 'src' });
    assert.deepStrictEqual(result().shown, []);
  });

  test('filters the files that come later, and drops those taken out', () => {
    const { order, put, result } = ordered({ query: 'cat' });
    const [first] = put({ '': [file('cat.jpg'), file('dog.jpg')] });
    assert.deepStrictEqual(result().shown, ['cat.jpg']);

    put({ 'more/': [file('cat2.jpg'), file('owl.jpg')] }, first);
    assert.deepStrictEqual(result().shown, ['more/cat2.jpg']);

    order.choose({ ...choices, query: 'owl' });
    assert.deepStrictEqual(result().shown, ['more/owl.jpg']);
  });
});

const start: ToFlatWorker = {
  type: 'start',
  pane: 'tab left',
  walk: 1,
  choices,
};

function sorter() {
  const answers: FromFlatWorker[] = [];
  const scheduled: (() => void)[] = [];
  const sorting = new FlatSorter(
    (answer) => answers.push(answer),
    (run) => scheduled.push(run),
  );
  const run = () => {
    for (const each of scheduled.splice(0)) {
      each();
    }
  };
  return { sorting, answers, run, scheduled };
}

suite('The sorter of flat views', () => {
  test('answers a burst of messages once, with the slots in order and the last batch of files they include', () => {
    const { sorting, answers, run, scheduled } = sorter();

    sorting.receive(start);
    sorting.receive({
      type: 'files',
      pane: 'tab left',
      walk: 1,
      batch: 1,
      folders: [{ under: '', entries: [file('b'), file('a')], slots: [0, 1] }],
      freed: [],
    });
    sorting.receive({
      type: 'files',
      pane: 'tab left',
      walk: 1,
      batch: 2,
      folders: [{ under: 'sub/', entries: [file('c')], slots: [2] }],
      freed: [],
    });
    assert.strictEqual(scheduled.length, 1);
    run();

    assert.deepStrictEqual(
      answers.map((answer) => ({ ...answer, order: [...answer.order] })),
      [
        {
          type: 'order',
          pane: 'tab left',
          walk: 1,
          batch: 2,
          query: '',
          order: [1, 0, 2],
          shown: undefined,
        },
      ],
    );
  });

  test('takes nothing from an earlier walk, and forgets a pane dropped', () => {
    const { sorting, answers, run } = sorter();
    sorting.receive({ ...start, walk: 2 });
    run();
    answers.length = 0;

    sorting.receive({
      type: 'files',
      pane: 'tab left',
      walk: 1,
      batch: 1,
      folders: [{ under: '', entries: [file('old')], slots: [0] }],
      freed: [],
    });
    run();
    assert.deepStrictEqual(answers, []);

    sorting.receive({ type: 'drop', pane: 'tab left' });
    sorting.receive({
      type: 'choose',
      pane: 'tab left',
      walk: 2,
      choices: { ...choices, query: 'x' },
    });
    run();
    assert.deepStrictEqual(answers, []);
  });
});

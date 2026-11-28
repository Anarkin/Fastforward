import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { plainSearch } from '../../../../../lib/shared/searchOptions';
import { FlatSorter } from '../../../../../tools/commander/page/flatSorter';
import type {
  FlatChoices,
  FromFlatWorker,
  ToFlatWorker,
} from '../../../../../tools/commander/page/flatMessages';
import { noFileColors } from '../../../../../lib/page/fileColors';
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
  options: plainSearch,
};

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
          options: plainSearch,
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

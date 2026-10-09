import * as assert from 'node:assert';
import { Commits, CommitsBuilder } from '../../history/commits';
import { extendHistory, regionHistory } from '../../history/extend';
import { entriesOf } from './historyFixtures';

const older = [
  { hash: 'c2', parents: ['c1'] },
  { hash: 's1', parents: ['c0'] },
  { hash: 'c1', parents: ['c0'] },
  { hash: 'c0', parents: [] },
];

function newerOf(lines: string): Commits {
  const builder = new CommitsBuilder([], true);
  builder.add(Buffer.from(lines));
  return builder.finishNow();
}

function extended(
  lines: string,
  tips: readonly string[],
  oldTimes: Readonly<Record<string, number>> = { c2: 30, s1: 25 },
) {
  return extendHistory({
    older: Commits.of(older),
    oldHeads: new Set(['c2', 's1']),
    oldTimes: new Map(Object.entries(oldTimes)),
    newer: newerOf(lines),
    tips: new Set(tips),
  });
}

function joined(newer: readonly { hash: string; parents: string[] }[]) {
  return entriesOf(Commits.of([...newer, ...older]));
}

suite('Extending a history', () => {
  test('puts the commits made on top of a tip above the history', () => {
    const history = extended('50 n2 n1\n40 n1 c2\n', ['n2', 's1']);
    assert.ok(history);
    assert.deepStrictEqual(
      entriesOf(history),
      joined([
        { hash: 'n2', parents: ['n1'] },
        { hash: 'n1', parents: ['c2'] },
      ]),
    );
  });

  test('puts a branch started inside the history above it, keeping the tips', () => {
    const history = extended('40 b1 c1\n', ['c2', 's1', 'b1']);
    assert.ok(history);
    assert.deepStrictEqual(
      entriesOf(history),
      joined([{ hash: 'b1', parents: ['c1'] }]),
    );
  });

  test('puts a merge of two tips above the history', () => {
    const history = extended('40 m c2 s1\n', ['m']);
    assert.ok(history);
    assert.deepStrictEqual(
      entriesOf(history),
      joined([{ hash: 'm', parents: ['c2', 's1'] }]),
    );
  });

  test('takes new commits of the same time in one line of descent, whose order the time cannot change', () => {
    assert.ok(extended('40 n2 n1\n40 n1 c2\n', ['n2', 's1']));
  });

  test('leaves the history to be read again when an old tip is neither kept nor built on, as an amend, a reset or a deleted branch leaves it', () => {
    assert.strictEqual(extended('40 n c1\n', ['n', 's1']), undefined);
  });

  test('takes new commits no newer than the tips they are built on, which git puts above those tips anyway', () => {
    const history = extended('31 n2 n1\n30 n1 c2\n', ['n2', 's1']);
    assert.ok(history);
    assert.deepStrictEqual(
      entriesOf(history),
      joined([
        { hash: 'n2', parents: ['n1'] },
        { hash: 'n1', parents: ['c2'] },
      ]),
    );
    assert.ok(extended('26 n c2\n', ['n', 's1']));
  });

  test('leaves it to be read again when a new commit is no newer than an old tip it is not built on, as git would put it among the old commits', () => {
    assert.strictEqual(extended('25 n c2\n', ['n', 's1']), undefined);
    assert.strictEqual(extended('28 b1 c1\n', ['c2', 's1', 'b1']), undefined);
  });

  test('leaves it to be read again when a tip built on shares its time with another old tip, as git could then swap them', () => {
    assert.strictEqual(
      extended('40 n c2\n', ['n', 's1'], { c2: 30, s1: 30 }),
      undefined,
    );
  });

  test('leaves it to be read again when new commits of the same time are on different lines, as git could put either first', () => {
    assert.strictEqual(
      extended('40 n1 c2\n40 n2 s1\n', ['n1', 'n2']),
      undefined,
    );
  });

  test('leaves it to be read again when a commit given as new is already in the history, as git can list one when clocks were set wrong', () => {
    assert.strictEqual(
      extended('50 n c1\n40 c1 c0\n', ['n', 'c2', 's1']),
      undefined,
    );
  });

  test('leaves it to be read again when nothing is new, a tip is in neither history, or the time of an old tip is unknown', () => {
    assert.strictEqual(extended('', ['c2']), undefined);
    assert.strictEqual(extended('40 n c2\n', ['n', 's1', 'ghost']), undefined);
    assert.strictEqual(
      extended('40 n c2\n', ['n', 's1'], { c2: 30 }),
      undefined,
    );
  });
});

suite('Extending a history among its newest commits', () => {
  const line = [
    { hash: 'c2', parents: ['c1'] },
    { hash: 'c1', parents: ['c0'] },
    { hash: 'c0', parents: [] },
  ];
  const merge = '35 m c2 f1\n15 f1 c0\n';
  const newest = '35 m c2 f1\n30 c2 c1\n20 c1 c0\n15 f1 c0\n';

  function amongNewest(
    newer: string,
    region: string,
    belowTimes: Readonly<Record<string, number>> = { c0: 10 },
    tips: readonly string[] = ['m'],
  ) {
    return regionHistory({
      older: Commits.of(line),
      oldHeads: new Set(['c2']),
      newer: newerOf(newer),
      tips: new Set(tips),
      region: newerOf(region),
      since: 15,
      belowTimes: new Map(Object.entries(belowTimes)),
    });
  }

  test('puts new commits among the newest old ones where git orders them, keeping the older ones below', () => {
    const history = amongNewest(merge, newest);
    assert.ok(history);
    assert.deepStrictEqual(
      entriesOf(history),
      entriesOf(
        Commits.of([
          { hash: 'm', parents: ['c2', 'f1'] },
          { hash: 'c2', parents: ['c1'] },
          { hash: 'c1', parents: ['c0'] },
          { hash: 'f1', parents: ['c0'] },
          { hash: 'c0', parents: [] },
        ]),
      ),
    );
  });

  test('takes newest commits sharing a time in one line of descent', () => {
    assert.ok(amongNewest(merge, '35 m c2 f1\n20 c2 c1\n20 c1 c0\n15 f1 c0\n'));
  });

  test('leaves it to be read again when a new commit is missing from the newest ones, as a clock set wrong leaves it', () => {
    assert.strictEqual(
      amongNewest(merge, '35 m c2 f1\n30 c2 c1\n20 c1 c0\n', {
        c0: 10,
        f1: 5,
      }),
      undefined,
    );
  });

  test('leaves it to be read again when the old commits among the newest are not the top of the old list', () => {
    assert.strictEqual(
      amongNewest(
        '35 m c1 f1\n15 f1 c0\n',
        '35 m c1 f1\n20 c1 c0\n15 f1 c0\n',
        { c0: 10 },
        ['m', 'c2'],
      ),
      undefined,
    );
  });

  test('leaves it to be read again when a commit just below the newest is not older than them, or its time is unknown', () => {
    assert.strictEqual(amongNewest(merge, newest, { c0: 15 }), undefined);
    assert.strictEqual(amongNewest(merge, newest, {}), undefined);
  });

  test('leaves it to be read again when commits just below the newest share a time, as git could queue them either way', () => {
    assert.strictEqual(
      amongNewest(
        '35 m c2 f1\n15 f1 x\n',
        '35 m c2 f1\n30 c2 c1\n20 c1 c0\n15 f1 x\n',
        { c0: 10, x: 10 },
      ),
      undefined,
    );
  });

  test('leaves it to be read again when the newest share a time off one line of descent', () => {
    assert.strictEqual(
      amongNewest(
        '35 m c2 f1\n20 f1 c0\n',
        '35 m c2 f1\n30 c2 c1\n20 c1 c0\n20 f1 c0\n',
      ),
      undefined,
    );
  });

  test('leaves it to be read again when an old tip is neither kept nor built on', () => {
    assert.strictEqual(
      amongNewest('35 m c1 f1\n15 f1 c0\n', '35 m c1 f1\n20 c1 c0\n15 f1 c0\n'),
      undefined,
    );
  });
});

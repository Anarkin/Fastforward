import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  Commits,
  CommitsBuilder,
} from '../../../../../tools/git/main/history/commits';
import {
  extendHistory,
  keepsTiedOrder,
  ranksOf,
  regionHistory,
} from '../../../../../tools/git/main/history/extend';
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

  test('leaves it to be read again when git takes old tips of the same time in another order than the history has them, as once HEAD moves from one to the other', () => {
    const tied = { c2: 30, s1: 30 };
    assert.ok(extended('40 b1 c1\n', ['b1', 'c2', 's1'], tied));
    assert.strictEqual(
      extended('40 b1 c1\n', ['b1', 's1', 'c2'], tied),
      undefined,
    );
    assert.ok(extended('40 b1 c1\n', ['b1', 's1', 'c2']));
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
      oldTimes: new Map([['c2', 30]]),
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

  test('leaves it to be read again when git takes old tips of the same time below the newest in another order than the history has them', () => {
    const below = {
      older: Commits.of([
        { hash: 'h', parents: ['c0'] },
        { hash: 'p', parents: ['c0'] },
        { hash: 'q', parents: ['c0'] },
        { hash: 'c0', parents: [] },
      ]),
      oldHeads: new Set(['h', 'p', 'q']),
      oldTimes: new Map([
        ['h', 30],
        ['p', 10],
        ['q', 10],
      ]),
      newer: newerOf('20 n c0\n'),
      region: newerOf('30 h c0\n20 n c0\n'),
      since: 20,
      belowTimes: new Map([['c0', 5]]),
    };
    assert.ok(regionHistory({ ...below, tips: new Set(['h', 'n', 'p', 'q']) }));
    assert.strictEqual(
      regionHistory({ ...below, tips: new Set(['h', 'n', 'q', 'p']) }),
      undefined,
    );
  });

  test('leaves it to be read again when an old tip just below the newest is built on and shares its time with another old tip, as git queues it only once the commit on it is out', () => {
    const builtOn = {
      older: Commits.of([
        { hash: 'p', parents: ['c0'] },
        { hash: 'a', parents: ['c0'] },
        { hash: 'c0', parents: [] },
      ]),
      oldHeads: new Set(['p', 'a']),
      newer: newerOf('20 n p\n'),
      tips: new Set(['c0', 'n', 'a']),
      region: newerOf('20 n p\n'),
      since: 20,
      belowTimes: new Map([['p', 10]]),
    };
    assert.ok(
      regionHistory({
        ...builtOn,
        oldTimes: new Map([
          ['p', 10],
          ['a', 9],
        ]),
      }),
    );
    assert.strictEqual(
      regionHistory({
        ...builtOn,
        oldTimes: new Map([
          ['p', 10],
          ['a', 10],
        ]),
      }),
      undefined,
    );
  });
});

function keepsOrder(
  times: Readonly<Record<string, number>>,
  heads: readonly string[],
  before: readonly string[],
  after: readonly string[],
) {
  const rankBefore = ranksOf(before);
  const rankAfter = ranksOf(after);
  return keepsTiedOrder(
    heads,
    (head) => times[head],
    (head) => rankBefore.get(head),
    (head) => rankAfter.get(head),
  );
}

suite('Keeping the order of heads git takes by time', () => {
  test('keeps the order while heads of the same time keep theirs, as git takes a tie in the order it is given the tips, though heads of different times may swap', () => {
    const times = { a: 10, c: 10, b: 20 };
    const heads = ['a', 'c', 'b'];
    assert.strictEqual(keepsOrder(times, heads, heads, ['b', 'a', 'c']), true);
    assert.strictEqual(keepsOrder(times, heads, heads, ['c', 'a', 'b']), false);
  });

  test('keeps the order of a head of unknown time only while it keeps its place to every other head, as its time could tie with any of them', () => {
    const times = { a: 10, b: 20 };
    const heads = ['a', 'b', 'u'];
    assert.strictEqual(keepsOrder(times, heads, heads, ['b', 'a', 'u']), true);
    assert.strictEqual(keepsOrder(times, heads, heads, ['u', 'a', 'b']), false);
  });

  test('does not keep the order when a head has no rank before or after', () => {
    const times = { a: 10, b: 20 };
    const heads = ['a', 'b'];
    assert.strictEqual(keepsOrder(times, heads, heads, heads), true);
    assert.strictEqual(keepsOrder(times, heads, ['a'], heads), false);
    assert.strictEqual(keepsOrder(times, heads, heads, ['a']), false);
  });
});

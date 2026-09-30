import * as assert from 'node:assert';
import {
  noNavigation,
  step,
  visit,
  type Navigation,
} from '../history/navigation';

const all = () => true;

function history(): Navigation {
  let navigation = noNavigation;
  let current: string | undefined;
  for (const hash of ['A', 'B', 'C', 'D']) {
    navigation = visit(navigation, current, hash);
    current = hash;
  }
  return navigation;
}

suite('Navigation', () => {
  test('remembers where it came from, not the first commit shown', () => {
    assert.deepStrictEqual(history(), { back: ['A', 'B', 'C'], forward: [] });
  });

  test('goes back and forward a step', () => {
    const back = step(history(), 'D', 'back', 1, all);
    assert.strictEqual(back?.target, 'C');
    assert.deepStrictEqual(back.navigation, {
      back: ['A', 'B'],
      forward: ['D'],
    });
    const forward = step(back.navigation, 'C', 'forward', 1, all);
    assert.strictEqual(forward?.target, 'D');
    assert.deepStrictEqual(forward.navigation, history());
  });

  test('goes several steps at once, keeping the ones in between', () => {
    const back = step(history(), 'D', 'back', 2, all);
    assert.strictEqual(back?.target, 'B');
    assert.deepStrictEqual(back.navigation, {
      back: ['A'],
      forward: ['D', 'C'],
    });
    const forward = step(back.navigation, 'B', 'forward', 2, all);
    assert.strictEqual(forward?.target, 'D');
    assert.deepStrictEqual(forward.navigation, history());
  });

  test('forgets the steps forward on a new visit', () => {
    const back = step(history(), 'D', 'back', 1, all);
    assert.ok(back);
    assert.deepStrictEqual(visit(back.navigation, 'C', 'E'), {
      back: ['A', 'B', 'C'],
      forward: [],
    });
  });

  test('forgets the steps forward on a replaced visit', () => {
    const back = step(history(), 'D', 'back', 1, all);
    assert.ok(back);
    assert.deepStrictEqual(visit(back.navigation, 'C', 'E', true), {
      back: ['A', 'B'],
      forward: [],
    });
  });

  test('keeps only the last 100 steps back', () => {
    let navigation = noNavigation;
    let current: string | undefined;
    for (let index = 0; index < 150; index++) {
      navigation = visit(navigation, current, `h${index}`);
      current = `h${index}`;
    }
    assert.strictEqual(navigation.back.length, 100);
    assert.strictEqual(navigation.back[0], 'h49');
    assert.strictEqual(navigation.back.at(-1), 'h148');
  });

  test('goes at least one step and at most as far as there are steps', () => {
    assert.deepStrictEqual(step(history(), 'D', 'back', 10, all), {
      navigation: { back: [], forward: ['D', 'C', 'B'] },
      target: 'A',
    });
    assert.strictEqual(step(history(), 'D', 'back', 0, all)?.target, 'C');
  });

  test('leaves out the commit shown when there is none', () => {
    assert.deepStrictEqual(step(history(), undefined, 'back', 1, all), {
      navigation: { back: ['A', 'B'], forward: [] },
      target: 'C',
    });
  });

  test('adds no step for a replaced one, or the same commit', () => {
    const navigation = history();
    assert.strictEqual(visit(navigation, 'D', 'E', true), navigation);
    assert.strictEqual(visit(navigation, 'D', 'D'), navigation);
  });

  test('skips and forgets steps whose commit is gone', () => {
    const back = step(history(), 'D', 'back', 1, (hash) => hash !== 'C');
    assert.strictEqual(back?.target, 'B');
    assert.deepStrictEqual(back.navigation, { back: ['A'], forward: ['D'] });
  });

  test('skips steps to the commit shown, or to the same commit twice', () => {
    const replaced = visit(visit(noNavigation, undefined, 'A'), 'A', 'B');
    const atA = visit(replaced, 'B', 'A', true);
    assert.strictEqual(step(atA, 'A', 'back', 1, all), undefined);
    const twice = { back: ['A', 'X', 'A'], forward: [] };
    const back = step(twice, 'B', 'back', 1, (hash) => hash !== 'X');
    assert.strictEqual(back?.target, 'A');
    assert.deepStrictEqual(back.navigation, { back: [], forward: ['B'] });
  });

  test('goes nowhere without steps', () => {
    assert.strictEqual(step(noNavigation, 'A', 'back', 1, all), undefined);
    assert.strictEqual(step(history(), 'D', 'forward', 1, all), undefined);
  });
});

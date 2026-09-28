import * as assert from 'node:assert';
import {
  noNavigation,
  step,
  visit,
  type Navigation,
} from '../history/navigation';

const all = () => true;

// A, B, C shown in turn, D showing now
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
    // C is the nearest step forward from B
    assert.deepStrictEqual(back.navigation, {
      back: ['A'],
      forward: ['D', 'C'],
    });
    const forward = step(back.navigation, 'B', 'forward', 2, all);
    assert.strictEqual(forward?.target, 'D');
    assert.deepStrictEqual(forward.navigation.back, ['A', 'B', 'C']);
  });

  test('forgets the steps forward on a new visit', () => {
    const back = step(history(), 'D', 'back', 1, all);
    assert.ok(back);
    assert.deepStrictEqual(visit(back.navigation, 'C', 'E'), {
      back: ['A', 'B', 'C'],
      forward: [],
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

  test('goes nowhere without steps', () => {
    assert.strictEqual(step(noNavigation, 'A', 'back', 1, all), undefined);
    assert.strictEqual(step(history(), 'D', 'forward', 1, all), undefined);
  });
});

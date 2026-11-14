import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  boundsKey,
  maximizedKey,
  placesKey,
  savedPlace,
  withPlace,
} from '../../../boot/places';

const bounds = { x: 10, y: 20, width: 800, height: 600 };
const other = { x: 40, y: 50, width: 900, height: 700 };

function stateOf(values: Record<string, unknown>): (key: string) => unknown {
  return (key) => values[key];
}

suite('Window places', () => {
  test('reads where each window was and whether it was maximized', () => {
    const get = stateOf({
      [placesKey]: {
        '1': { bounds, maximized: true },
        '2': { bounds: other, maximized: false },
      },
    });
    assert.deepStrictEqual(savedPlace(get, '1', true), {
      bounds,
      maximized: true,
    });
    assert.deepStrictEqual(savedPlace(get, '2', false), {
      bounds: other,
      maximized: false,
    });
    assert.deepStrictEqual(savedPlace(get, '3', false), {
      bounds: undefined,
      maximized: false,
    });
  });

  test('puts the first window where the single window of before was, while no window has a place of its own', () => {
    const before = stateOf({ [boundsKey]: bounds, [maximizedKey]: true });
    assert.deepStrictEqual(savedPlace(before, '1', true), {
      bounds,
      maximized: true,
    });
    assert.deepStrictEqual(savedPlace(before, '2', false), {
      bounds: undefined,
      maximized: false,
    });
    const since = stateOf({
      [boundsKey]: bounds,
      [maximizedKey]: true,
      [placesKey]: {},
    });
    assert.deepStrictEqual(savedPlace(since, '1', true), {
      bounds: undefined,
      maximized: false,
    });
  });

  test('saves the place of a window beside those of the other windows still open, forgetting the places of windows closed', () => {
    const saved = {
      '1': { bounds, maximized: false },
      '2': { bounds: other, maximized: true },
      '9': { bounds, maximized: false },
    };
    assert.deepStrictEqual(
      withPlace(saved, '2', { bounds, maximized: false }, ['1', '2', '3']),
      {
        '1': { bounds, maximized: false },
        '2': { bounds, maximized: false },
      },
    );
    assert.deepStrictEqual(
      withPlace(saved, '2', { bounds, maximized: false }, ['1']),
      { '1': { bounds, maximized: false } },
    );
    assert.deepStrictEqual(
      withPlace(undefined, '1', { bounds, maximized: true }, ['1']),
      { '1': { bounds, maximized: true } },
    );
  });
});

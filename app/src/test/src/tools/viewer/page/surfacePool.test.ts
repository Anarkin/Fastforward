import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { poolOf } from '../../../../../tools/viewer/page/surfacePool';

function pool() {
  const log: string[] = [];
  let made = 0;
  return {
    log,
    surfaces: poolOf(
      () => `surface ${++made}`,
      (surface) => log.push(`${surface} rested`),
      (surface) => log.push(`${surface} dropped`),
    ),
  };
}

suite('Pool of the surfaces cells are drawn on', () => {
  test('hands the surface a view gave back to the next view, so a tab shown after another draws with the glyphs drawn before', () => {
    const { log, surfaces } = pool();
    const first = surfaces.taken();
    surfaces.givenBack(first);

    assert.strictEqual(surfaces.taken(), first);
    assert.deepStrictEqual(log, ['surface 1 rested']);
  });

  test('makes a surface for a view shown beside another, and keeps one of the two once both are gone', () => {
    const { log, surfaces } = pool();
    const first = surfaces.taken();
    const second = surfaces.taken();

    surfaces.givenBack(first);
    surfaces.givenBack(second);

    assert.notStrictEqual(first, second);
    assert.deepStrictEqual(log, ['surface 1 rested', 'surface 2 dropped']);
    assert.strictEqual(surfaces.taken(), first);
  });
});

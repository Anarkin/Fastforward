import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { RowRequests } from '../../../../tools/commander/page/rowRequests';

function requests() {
  const sent: [number, string][] = [];
  return {
    sent,
    rows: new RowRequests<string>((request, ask) => sent.push([request, ask])),
  };
}

suite('Rows asked of the viewer', () => {
  test('asks one at a time, keeping only the latest wish while one is answered, and sends it once the answer comes', () => {
    const { sent, rows } = requests();
    rows.ask('top');
    rows.ask('middle');
    rows.ask('end');
    assert.deepStrictEqual(sent, [[1, 'top']]);

    assert.strictEqual(rows.answered(1), 'top');
    assert.deepStrictEqual(sent, [
      [1, 'top'],
      [2, 'end'],
    ]);
    assert.strictEqual(rows.answered(2), 'end');
    rows.ask('again');
    assert.deepStrictEqual(sent.at(-1), [3, 'again']);
  });

  test('ignores answers it did not ask for, or asked for before starting over', () => {
    const { sent, rows } = requests();
    rows.ask('old');
    rows.restart();
    rows.ask('new');
    assert.deepStrictEqual(sent, [
      [1, 'old'],
      [2, 'new'],
    ]);

    assert.strictEqual(rows.answered(1), undefined);
    assert.strictEqual(rows.answered(7), undefined);
    assert.strictEqual(rows.answered(2), 'new');
  });
});

import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { RowRequests } from '../../../../tools/commander/page/rowRequests';

function requests() {
  const sent: [number, string][] = [];
  let first: number | undefined;
  const numbered = (request: number) => request - (first ?? request) + 1;
  const rows = new RowRequests<string>((request, ask) => {
    first ??= request;
    sent.push([numbered(request), ask]);
  });
  return {
    sent,
    rows: {
      ask: (wanted: string) => rows.ask(wanted),
      answered: (request: number) => rows.answered(request + (first ?? 1) - 1),
      restart: () => rows.restart(),
    },
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

  test('never numbers a request as one made before it by another, so a late answer to the rows of an encoding left is not taken for one in the encoding chosen', () => {
    const asked: number[] = [];
    const left = new RowRequests<string>((request) => asked.push(request));
    left.ask('utf-16le');
    const chosen = new RowRequests<string>((request) => asked.push(request));
    chosen.ask('windows-1252');

    const [lateAnswer = 0, answer = 0] = asked;
    assert.strictEqual(chosen.answered(lateAnswer), undefined);
    assert.strictEqual(chosen.answered(answer), 'windows-1252');
  });
});

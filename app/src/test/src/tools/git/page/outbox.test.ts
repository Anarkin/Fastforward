import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { settling } from '../../../../../tools/git/page/outbox';

const settled = () => new Promise((resolve) => setTimeout(resolve, 0));

suite('Commit list keys', () => {
  test('sends a selection made by a held key only once the key settles', async () => {
    const sent: string[] = [];
    const { settle } = settling((hash: string) => sent.push(hash), 0);
    settle('a', false);
    settle('b', true);
    settle('c', true);
    assert.deepStrictEqual(sent, ['a']);
    await settled();
    assert.deepStrictEqual(sent, ['a', 'c']);
    settle('d', true);
    settle('e', false);
    await settled();
    assert.deepStrictEqual(sent, ['a', 'c', 'e']);
  });

  test('sends a selection made by a held key at once before anything sent after it, and only once', async () => {
    const sent: string[] = [];
    const { settle, send } = settling(
      (message: string) => sent.push(message),
      0,
    );
    settle('select b', true);
    send('switch tab');
    send('load tree');
    assert.deepStrictEqual(sent, ['select b', 'switch tab', 'load tree']);
    await settled();
    assert.deepStrictEqual(sent, ['select b', 'switch tab', 'load tree']);
  });

  test('sends what does not wait on a selection, such as the pages scrolled to, at once, still holding a selection made by a held key until the key settles', async () => {
    const sent: string[] = [];
    const { settle, pass } = settling(
      (message: string) => sent.push(message),
      0,
    );
    settle('select b', true);
    pass('load page');
    settle('select c', true);
    pass('load next page');
    assert.deepStrictEqual(sent, ['load page', 'load next page']);
    await settled();
    assert.deepStrictEqual(sent, ['load page', 'load next page', 'select c']);
  });

  test('holds what follows a selection made by a held key with it, dropping it when the key moves on', async () => {
    const sent: string[] = [];
    const { settle, follow } = settling(
      (message: string) => sent.push(message),
      0,
    );
    settle('select b', true);
    follow('load tree b');
    settle('select c', true);
    follow('load tree c');
    assert.deepStrictEqual(sent, []);
    await settled();
    assert.deepStrictEqual(sent, ['select c', 'load tree c']);
    settle('select d', false);
    follow('load tree d');
    assert.deepStrictEqual(sent, [
      'select c',
      'load tree c',
      'select d',
      'load tree d',
    ]);
  });
});

import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, suite, test } from 'vitest';
import { recoveryCopies } from '../../../../lib/main/recoveryCopies';
import { fakeTimer } from '../../../helpers/fakeTimer';
import { removeFolder, tempFolder } from '../../../helpers/tempFolders';

let folder: string;
let copies: string;

beforeEach(() => {
  folder = tempFolder('recovery');
  copies = path.join(folder, 'recovery');
});

afterEach(() => {
  removeFolder(folder);
});

const kept = () =>
  fs.existsSync(copies) ? fs.readdirSync(copies).toSorted() : [];

suite('Copies of unsaved text to recover', () => {
  test('writes the copies of what is kept a moment after it changes, once for many changes, the newest of each, and removes a copy dropped', async () => {
    const { timer, waiting, fire } = fakeTimer();
    const recovery = await recoveryCopies(copies, timer);
    let text = 'one';
    recovery.keep('editor 1', () => ({ text }));
    text = 'two';
    recovery.keep('editor 1', () => ({ text }));
    recovery.keep('canvas 2', () => ({ text: 'board' }));
    assert.deepStrictEqual(kept(), []);
    assert.strictEqual(waiting().length, 1);

    await fire();
    await recovery.flush();
    assert.deepStrictEqual(kept(), ['canvas%202.json', 'editor%201.json']);
    assert.deepStrictEqual(
      JSON.parse(fs.readFileSync(path.join(copies, 'editor%201.json'), 'utf8')),
      { text: 'two' },
    );

    recovery.drop('canvas 2');
    await recovery.flush();
    assert.deepStrictEqual(kept(), ['editor%201.json']);
  });

  test('gives the copies a run left, as after a crash, a shutdown or a quit with files not saved, to the next once each, writing at once what waits as the app quits, and keeping a copy not taken for the run after', async () => {
    const first = await recoveryCopies(copies, fakeTimer().timer);
    first.keep('editor 1', () => ({ text: 'left' }));
    first.keep('editor 2', () => ({ text: 'never shown' }));
    await first.flush();

    const next = await recoveryCopies(copies, fakeTimer().timer);
    assert.deepStrictEqual(next.take('editor 1'), { text: 'left' });
    assert.strictEqual(next.take('editor 1'), undefined);
    assert.strictEqual(next.take('editor 3'), undefined);
    next.drop('editor 1');
    next.keep('editor 4', () => ({ text: 'written as it quits' }));
    await next.flush();

    assert.deepStrictEqual(kept(), ['editor%202.json', 'editor%204.json']);
    const third = await recoveryCopies(copies, fakeTimer().timer);
    assert.deepStrictEqual(third.take('editor 2'), { text: 'never shown' });
  });

  test('skips a copy it cannot read, as one cut short by a crash', async () => {
    fs.mkdirSync(copies);
    fs.writeFileSync(path.join(copies, 'editor%201.json'), '{"text": "cut');
    fs.writeFileSync(path.join(copies, 'notes.txt'), 'other');
    const recovery = await recoveryCopies(copies, fakeTimer().timer);
    assert.strictEqual(recovery.take('editor 1'), undefined);
  });
});

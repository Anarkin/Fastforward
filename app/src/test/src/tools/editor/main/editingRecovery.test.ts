import * as assert from 'node:assert';
import { ChangeSet } from '@codemirror/state';
import { suite, test } from 'vitest';
import { plainOf } from '../../../../../lib/shared/sentences';
import { strings } from '../../../../../lib/shared/strings';
import { fakeRecovery } from '../../../../helpers/fakeRecovery';
import { EditorPage, editing } from './editingFixtures';

const typed = (version: number, insert: string, length: number) => ({
  type: 'editText' as const,
  tab: '1',
  update: {
    version,
    changes: ChangeSet.of({ from: 0, insert }, length).toJSON(),
  },
});

const copyOf = (file: string, text: string) => ({
  file,
  text,
  encoding: 'utf-8',
  bom: false,
  ending: 'lf',
  strayEndings: [],
  keptBytes: [],
});

suite('Recovering the text edited', () => {
  test('keeps a copy of the text of a tab while it differs from its file, as the text lived in memory alone and a shutdown or a crash lost it, and drops the copy once saved or closed', async () => {
    const { recovery, copies } = fakeRecovery();
    const files = { 'a.txt': 'one\n' };
    const { edits } = editing(files, undefined, undefined, recovery);
    const page = new EditorPage();
    await edits.show(page, '1', 'a.txt');
    assert.deepStrictEqual(copies(), {});

    await edits.receive(page, typed(0, 'A', 4));
    assert.deepStrictEqual(Object.keys(copies()), ['editor 1']);
    assert.strictEqual(
      Reflect.get(Object(copies()['editor 1']), 'text'),
      'Aone\n',
    );
    await edits.save(page, '1');
    assert.deepStrictEqual(copies(), {});

    await edits.receive(page, typed(1, 'B', 5));
    assert.deepStrictEqual(Object.keys(copies()), ['editor 1']);
    edits.closed('1');
    assert.deepStrictEqual(copies(), {});
  });

  test('shows the copy a run left of a tab of its file as its text not saved, line endings and all, telling so once, and saves it as edited, but leaves alone a copy of another file or one it cannot read', async () => {
    const { recovery, copies } = fakeRecovery({
      'editor 1': copyOf('a.txt', 'recovered\nline'),
      'editor 2': copyOf('other.txt', 'not this file'),
      'editor 3': { file: 'c.txt', text: 7 },
    });
    const files = { 'a.txt': 'one\r\n', 'b.txt': 'b\n', 'c.txt': 'c\n' };
    const { edits, notices } = editing(files, undefined, undefined, recovery);
    const page = new EditorPage();

    await edits.show(page, '1', 'a.txt');
    await edits.show(page, '2', 'b.txt');
    await edits.show(page, '3', 'c.txt');
    await edits.receive(page, { type: 'readEdited', tab: '1' });

    assert.strictEqual(page.last('editedText')?.shown.text, 'recovered\nline');
    assert.deepStrictEqual(
      [edits.unsaved('1'), edits.unsaved('2'), edits.unsaved('3')],
      [true, false, false],
    );
    assert.deepStrictEqual(notices, [
      plainOf(strings.editor.recovered('a.txt')),
    ]);
    assert.deepStrictEqual(Object.keys(copies()), ['editor 1']);
    await edits.show(page, '1', 'a.txt');
    assert.strictEqual(notices.length, 1);

    await edits.save(page, '1');
    assert.strictEqual(
      Buffer.from(files['a.txt']).toString('latin1'),
      'recovered\nline',
    );
  });
});

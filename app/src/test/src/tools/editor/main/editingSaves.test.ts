import * as assert from 'node:assert';
import { ChangeSet } from '@codemirror/state';
import { suite, test } from 'vitest';
import { EditorPage, editing, editFrom } from './editingFixtures';

const typed = (version: number, insert: string, length: number) => ({
  type: 'editText' as const,
  tab: '1',
  update: {
    version,
    changes: ChangeSet.of({ from: 0, insert }, length).toJSON(),
  },
});

suite('Saving a file edited', () => {
  test('saves a file one save at a time, a save asked for while one runs waiting for it, as two saves writing at once cut the file short or left a stale end', async () => {
    const files = { 'a.txt': 'one\n' };
    const { edits, saving, showing } = editing(files);
    const page = new EditorPage();
    showing.push(page);
    await edits.show(page, '1', 'a.txt');
    await edits.receive(page, { type: 'readEdited', tab: '1' });
    const held = Promise.withResolvers<void>();
    saving.until = held.promise;

    await edits.receive(page, typed(0, 'A', 4));
    const first = edits.save(page, '1');
    await edits.receive(page, typed(1, 'B', 5));
    const second = edits.save(page, '1');
    held.resolve();
    assert.deepStrictEqual(await Promise.all([first, second]), [true, true]);

    assert.strictEqual(saving.most, 1);
    assert.strictEqual(
      Buffer.from(files['a.txt']).toString('latin1'),
      'BAone\n',
    );
    assert.strictEqual(edits.unsaved('1'), false);
  });

  test('takes a change another program makes right after a save for a change on disk, reading it again, rather than for its own save', async () => {
    const files: Record<string, string | Uint8Array> = { 'a.txt': 'one\n' };
    const { edits, saving, showing } = editing(files);
    const page = new EditorPage();
    showing.push(page);
    await edits.show(page, '1', 'a.txt');
    await edits.receive(page, { type: 'readEdited', tab: '1' });
    saving.after = (file) => {
      files[file] = 'theirs\n';
    };

    await edits.receive(
      page,
      editFrom(page, '1', { from: 0, insert: 'mine ' }),
    );
    await edits.receive(page, { type: 'saveText', tab: '1' });

    assert.strictEqual(page.last('editedText')?.shown.text, 'theirs\n');
  });
});

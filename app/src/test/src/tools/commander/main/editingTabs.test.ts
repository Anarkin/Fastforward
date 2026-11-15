import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { EditorPage, settled, editing } from './editingFixtures';

suite('Editing a file in a tab', () => {
  test('shows a tab opened under the id of a closed one the file it opens, never the one the closed tab had', async () => {
    const { edits } = editing({ 'first.txt': 'first\n', 'second.txt': '' });
    const page = new EditorPage();
    await edits.show(page, '1', 'first.txt');
    await edits.receive(page, { type: 'readEdited', tab: '1' });
    await edits.receive(page, {
      type: 'editState',
      tab: '1',
      version: 0,
      state: { selection: 3 },
    });
    edits.closed('1');
    await edits.show(page, '1', 'second.txt');
    await edits.receive(page, { type: 'readEdited', tab: '1' });
    assert.strictEqual(page.last('editing')?.file, 'second.txt');
    assert.strictEqual(page.last('editedText')?.shown.text, '');
    assert.strictEqual(page.last('editedText')?.state, undefined);
  });

  test('tells the page nothing of a file still being read for a tab that closed meanwhile, as a tab opened later may take its id', async () => {
    const { edits, held } = editing({
      'first.txt': 'first\n',
      'second.txt': 'second\n',
    });
    const reading = Promise.withResolvers<void>();
    held.set('first.txt', reading.promise);
    const page = new EditorPage();
    const showingFirst = edits.show(page, '1', 'first.txt');
    await settled();
    edits.closed('1');
    await edits.show(page, '1', 'second.txt');
    reading.resolve();
    await showingFirst;
    await settled();
    assert.deepStrictEqual(
      page.messages.flatMap((message) =>
        message.type === 'editing' ? [message.file] : [],
      ),
      ['second.txt'],
    );
    await edits.receive(page, { type: 'readEdited', tab: '1' });
    assert.strictEqual(page.last('editedText')?.shown.text, 'second\n');
  });

  test('reads the file a tab shows rather than one still being read for it, should the tab show another file meanwhile', async () => {
    const { edits, held } = editing({
      'first.txt': 'first\n',
      'second.txt': 'second\n',
    });
    const reading = Promise.withResolvers<void>();
    held.set('first.txt', reading.promise);
    const page = new EditorPage();
    const showingFirst = edits.show(page, '1', 'first.txt');
    await settled();
    const showingSecond = edits.show(page, '1', 'second.txt');
    reading.resolve();
    await Promise.all([showingFirst, showingSecond]);
    await settled();
    assert.strictEqual(page.last('editing')?.file, 'second.txt');
    await edits.receive(page, { type: 'readEdited', tab: '1' });
    assert.strictEqual(page.last('editedText')?.shown.text, 'second\n');
  });
});

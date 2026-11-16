import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import type { EditingMessage } from '../../../../../tools/commander/main/editing';
import { EditorPage, settled, editing, editFrom } from './editingFixtures';

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
      state: '{"selection":3}',
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

  test('reads, edits, keeps, saves and reads again no tab of another window for its page, nor edits the .editorconfig its line ending comes from, as the page is not trusted', async () => {
    const config = 'work/.editorconfig';
    const { edits, saved, showing, windows, editedSources } = editing(
      { 'a.txt': 'one\n' },
      undefined,
      () =>
        Promise.resolve([{ kind: 'editorConfig', ending: 'lf', file: config }]),
    );
    const page = new EditorPage();
    const stranger = new EditorPage();
    showing.push(page);
    windows.set('1', page);
    await edits.show(page, '1', 'a.txt');
    await edits.receive(page, { type: 'readEdited', tab: '1' });
    await settled();
    const told = page.messages.length;
    const forged: EditingMessage[] = [
      { type: 'readEdited', tab: '1' },
      editFrom(page, '1', { from: 0, insert: 'x' }),
      { type: 'editState', tab: '1', version: 0, state: '{"selection":3}' },
      { type: 'saveText', tab: '1' },
      { type: 'saveIn', tab: '1', encoding: 'utf-16le', bom: true },
      { type: 'reloadEdited', tab: '1' },
      { type: 'reopenIn', tab: '1', encoding: 'windows-1252' },
      { type: 'editSource', tab: '1', file: config },
    ];
    for (const message of forged) {
      await edits.receive(stranger, message);
    }
    await settled();
    assert.deepStrictEqual(stranger.messages, []);
    assert.strictEqual(page.messages.length, told);
    assert.deepStrictEqual(saved, []);
    assert.deepStrictEqual(editedSources, []);
    assert.strictEqual(edits.unsaved('1'), false);
    await edits.receive(page, { type: 'readEdited', tab: '1' });
    assert.strictEqual(page.last('editedText')?.shown.text, 'one\n');
    assert.strictEqual(page.last('editedText')?.state, undefined);
  });
});

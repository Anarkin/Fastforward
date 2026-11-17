import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, suite, test } from 'vitest';
import type { Tab } from '../../../../../shell/main/toolContract';
import { strings } from '../../../../../lib/shared/strings';
import { plainOf } from '../../../../../lib/shared/sentences';
import { removeFolder, tempFolder } from '../../../../helpers/tempFolders';
import { editFrom, settled } from './editingFixtures';
import { editor } from './editorFixtures';

suite('Editor tool', () => {
  let opened: string;

  beforeEach(() => {
    opened = tempFolder('editor');
  });

  afterEach(() => removeFolder(opened));

  test('tells the page to close brackets as they are typed once the settings say so', () => {
    const { tool, page, closing } = editor();
    tool.ready(page);
    assert.strictEqual(page.last('settings')?.closeBrackets, false);
    closing.now = true;
    tool.reloadSettings();
    assert.strictEqual(page.last('settings')?.closeBrackets, true);
  });

  test('edits a file viewed in an editor tab of its own beside the viewer, starting at the line the viewer showed, or goes to the tab editing it already as it was', async () => {
    const notes = path.join(opened, 'notes.txt');
    fs.writeFileSync(notes, 'one\ntwo\n');
    const { tool, page, tabs, edited } = editor();
    tabs.push({ id: '3', tool: 'viewer', root: notes });
    await tool.editViewed(page, notes, { byte: 4 });
    assert.deepStrictEqual(edited, [notes]);
    const editing: Tab = { id: '4', tool: 'editor', root: notes };
    tabs.push(editing);
    await tool.show(page, editing);
    await tool.receive(page, { type: 'readEdited', tab: '4' });
    await settled();
    assert.strictEqual(page.last('editedText')?.at, 4);

    await tool.editViewed(page, notes, { byte: 0 });
    assert.deepStrictEqual(edited, [notes, notes]);
  });

  test('views a file edited in a viewer tab of its own beside the editor, starting at the byte the line at the top of the editor starts at on disk, in the encoding of the file on disk', async () => {
    const notes = path.join(opened, 'notes.txt');
    fs.writeFileSync(notes, Buffer.from('é\r\ntwo\r\n', 'utf8'));
    const { tool, page, tabs, viewed } = editor();
    const editing: Tab = { id: '3', tool: 'editor', root: notes };
    tabs.push(editing);
    await tool.show(page, editing);
    await tool.receive(page, { type: 'readEdited', tab: '3' });
    await settled();
    await tool.receive(page, { type: 'viewEdited', tab: '3', at: 2 });
    assert.deepStrictEqual(viewed, [[notes, { byte: 4, encoding: 'utf-8' }]]);
  });

  test('views a file with changes not saved as it is on disk at once, keeping the changes in the editor unsaved', async () => {
    const notes = path.join(opened, 'notes.txt');
    fs.writeFileSync(notes, 'one\n');
    const { tool, page, tabs, viewed } = editor();
    const editing: Tab = { id: '3', tool: 'editor', root: notes };
    tabs.push(editing);
    await tool.show(page, editing);
    await tool.receive(page, { type: 'readEdited', tab: '3' });
    await settled();
    const changed = async () => {
      await tool.receive(page, editFrom(page, '3', { from: 0, insert: 'x' }));
      await settled();
    };

    await changed();
    await tool.receive(page, { type: 'viewEdited', tab: '3', at: 0 });
    assert.deepStrictEqual(
      viewed.map(([file]) => file),
      [notes],
    );
    assert.strictEqual(fs.readFileSync(notes, 'utf8'), 'one\n');
    assert.strictEqual(tool.names([editing]).get('3')?.unsaved, true);
  });

  test('views no file not saved yet, saying why, as nothing of it is on disk', async () => {
    const notes = path.join(opened, 'new.txt');
    const { tool, page, tabs, viewed, notices } = editor();
    const editing: Tab = { id: '3', tool: 'editor', root: notes };
    tabs.push(editing);
    await tool.show(page, editing);
    await tool.receive(page, { type: 'readEdited', tab: '3' });
    await settled();
    await tool.receive(page, { type: 'viewEdited', tab: '3', at: 0 });
    assert.deepStrictEqual(viewed, []);
    assert.deepStrictEqual(
      notices.map((notice) => plainOf(notice.message)),
      [plainOf(strings.editor.notSavedToView('new.txt'))],
    );
  });

  test('opens the diff of the versions of the file edited, as it is on disk, and of no tab it does not know', async () => {
    const notes = path.join(opened, 'notes.txt');
    fs.writeFileSync(notes, 'one\n');
    const { tool, page, tabs, compared } = editor();
    const editing: Tab = { id: '3', tool: 'editor', root: notes };
    tabs.push(editing);
    await tool.show(page, editing);
    await tool.receive(page, { type: 'compareVersions', tab: '3' });
    await tool.receive(page, { type: 'compareVersions', tab: '4' });
    assert.deepStrictEqual(compared, [notes]);
  });

  test('edits no copy taken out of an archive or a commit to view it, saying why', async () => {
    const copy = path.join(opened, 'viewed', 'ab12', 'notes.txt');
    fs.mkdirSync(path.dirname(copy), { recursive: true });
    fs.writeFileSync(copy, 'one\n');
    const { tool, page, tabs, edited, notices } = editor({
      viewedCopies: [copy],
    });
    tabs.push({ id: '3', tool: 'viewer', root: copy });
    await tool.editViewed(page, copy, { byte: 0 });
    assert.deepStrictEqual(edited, []);
    assert.deepStrictEqual(
      notices.map((notice) => plainOf(notice.message)),
      [plainOf(strings.editor.viewedCopy('notes.txt'))],
    );
  });

  test('names an editing tab after its file, leaving it the icon of the editor', () => {
    const code = path.join(opened, 'code.ts');
    const { tool } = editor();
    assert.deepStrictEqual(
      tool.names([{ id: '6', tool: 'editor', root: code }]).get('6'),
      { name: 'code.ts' },
    );
  });
});

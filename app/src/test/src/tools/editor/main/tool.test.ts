import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, suite, test } from 'vitest';
import type { Tab } from '../../../../../shell/main/toolContract';
import { strings } from '../../../../../lib/shared/strings';
import { plainOf } from '../../../../../lib/shared/sentences';
import { editorIconUrl } from '../../../../../tools/editor/main/icons';
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

  test('turns the tab of a file viewed into one editing it, starting at the line the viewer showed, or goes to the tab editing it already', async () => {
    const notes = path.join(opened, 'notes.txt');
    fs.writeFileSync(notes, 'one\ntwo\n');
    const { tool, page, tabs, turned, edited } = editor();
    tabs.push({ id: '3', tool: 'viewer', root: notes });
    await tool.editViewed(page, '3', notes, { byte: 4 });
    assert.deepStrictEqual(turned, ['3']);
    const editing: Tab = { id: '3', tool: 'editor', root: notes };
    tabs.splice(0, 1, editing);
    await tool.show(page, editing);
    await tool.receive(page, { type: 'readEdited', tab: '3' });
    await settled();
    assert.strictEqual(page.last('editedText')?.at, 4);

    tabs.push({ id: '4', tool: 'viewer', root: notes });
    await tool.editViewed(page, '4', notes, { byte: 0 });
    assert.deepStrictEqual(turned, ['3']);
    assert.deepStrictEqual(edited, [notes]);
  });

  test('turns the tab of a file edited into one viewing it, starting at the byte the line at the top of the editor starts at on disk, in the encoding of the file on disk', async () => {
    const notes = path.join(opened, 'notes.txt');
    fs.writeFileSync(notes, Buffer.from('é\r\ntwo\r\n', 'utf8'));
    const { tool, page, tabs, viewed } = editor();
    const editing: Tab = { id: '3', tool: 'editor', root: notes };
    tabs.push(editing);
    await tool.show(page, editing);
    await tool.receive(page, { type: 'readEdited', tab: '3' });
    await settled();
    await tool.receive(page, { type: 'viewEdited', tab: '3', at: 2 });
    assert.deepStrictEqual(viewed, [['3', { byte: 4, encoding: 'utf-8' }]]);
  });

  test('views a file with changes not saved only once told to save them, saving them first, or to drop them, leaving the file on disk as it was', async () => {
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
    assert.strictEqual(viewed.length, 0);
    await tool.receive(page, {
      type: 'viewEdited',
      tab: '3',
      at: 0,
      save: true,
    });
    assert.strictEqual(fs.readFileSync(notes, 'utf8'), 'xone\n');
    await changed();
    await tool.receive(page, {
      type: 'viewEdited',
      tab: '3',
      at: 0,
      discard: true,
    });
    assert.strictEqual(fs.readFileSync(notes, 'utf8'), 'xone\n');
    assert.deepStrictEqual(
      viewed.map(([tab]) => tab),
      ['3', '3'],
    );
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

  test('edits no copy taken out of an archive or a commit to view it, saying why', async () => {
    const copy = path.join(opened, 'viewed', 'ab12', 'notes.txt');
    fs.mkdirSync(path.dirname(copy), { recursive: true });
    fs.writeFileSync(copy, 'one\n');
    const { tool, page, tabs, turned, notices } = editor({
      viewedCopies: [copy],
    });
    tabs.push({ id: '3', tool: 'viewer', root: copy });
    await tool.editViewed(page, '3', copy, { byte: 0 });
    assert.deepStrictEqual(turned, []);
    assert.deepStrictEqual(
      notices.map((notice) => plainOf(notice.message)),
      [plainOf(strings.editor.viewedCopy('notes.txt'))],
    );
  });

  test('gives an editing tab the icon of its file, at an address naming the file, served for that tab and file only', async () => {
    const code = path.join(opened, 'code.ts');
    const { tool, tabs, iconsLoaded } = editor();
    const editing: Tab = { id: '6', tool: 'editor', root: code };
    tabs.push({ id: '4', tool: 'commander', root: opened }, editing);
    const served = async (url: string) =>
      (await tool.icon(new URL(`fastforward://app${url}`))).status;
    assert.strictEqual(
      tool.names([editing]).get('6')?.icon,
      editorIconUrl('6', code),
    );
    assert.strictEqual(await served(editorIconUrl('6', code)), 200);
    assert.strictEqual(
      await served(editorIconUrl('6', path.join(opened, 'other.md'))),
      404,
    );
    assert.strictEqual(await served(editorIconUrl('4', opened)), 404);
    assert.deepStrictEqual(iconsLoaded, [code]);
  });
});

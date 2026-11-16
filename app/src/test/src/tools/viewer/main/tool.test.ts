import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, suite, test } from 'vitest';
import type { Tab } from '../../../../../shell/main/toolContract';
import { viewerIconUrl } from '../../../../../tools/viewer/main/icons';
import { removeFolder, tempFolder } from '../../../../helpers/tempFolders';
import { ViewerPage, viewer } from './viewerFixtures';

suite('Viewer tool', () => {
  let opened: string;

  beforeEach(() => {
    opened = tempFolder('viewer');
  });

  afterEach(() => removeFolder(opened));

  test('names a tab after its file with the icon of the file and gives its folder as the folder of the tab', async () => {
    const notes = path.join(opened, 'notes.txt');
    fs.writeFileSync(notes, 'one');
    const { tool, page } = viewer();
    const viewing: Tab = { id: '3', tool: 'viewer', root: notes };

    assert.deepStrictEqual(tool.names([viewing]).get('3'), {
      name: 'notes.txt',
      icon: viewerIconUrl('3', notes),
    });
    assert.strictEqual(tool.folderOf(viewing), opened);
    await tool.show(page, viewing);
    assert.deepStrictEqual(page.of('show'), [
      { type: 'show', tab: '3', file: notes },
    ]);
  });

  test('reads the rows of a file viewed in one window while another shows another tab, answering only the page that views it, as the page is not trusted', async () => {
    const notes = path.join(opened, 'notes.txt');
    fs.writeFileSync(notes, 'one\ntwo\n');
    const { tool, page, send } = viewer();
    const other = new ViewerPage();
    await tool.show(page, { id: '3', tool: 'viewer', root: notes });
    await tool.show(other, { id: '4', tool: 'viewer', root: notes });
    const rows = {
      type: 'readRows',
      tab: '3',
      encoding: 'utf-8',
      anchor: 0,
      exact: true,
      before: 0,
      after: 2,
      least: 0,
    } as const;
    await send({ ...rows, request: 1 }, other);
    await send({ ...rows, request: 2 });
    assert.deepStrictEqual(other.of('rows'), []);
    assert.deepStrictEqual(
      page.of('rows').map((answer) => answer.rows.map((row) => row.text)),
      [['one', 'two']],
    );
  });

  test('serves the icon of the file a tab views, and nothing for a file no tab views', async () => {
    const notes = path.join(opened, 'notes.txt');
    fs.writeFileSync(notes, 'one');
    const { tool, tabs } = viewer();
    tabs.push({ id: '3', tool: 'viewer', root: notes });

    const icon = await tool.icon(
      new URL(`fastforward://app${viewerIconUrl('3', notes)}`),
    );
    assert.strictEqual(icon.status, 200);
    assert.strictEqual(await icon.text(), `icon of ${notes}`);
    const other = await tool.icon(
      new URL(
        `fastforward://app${viewerIconUrl('3', path.join(opened, 'other.txt'))}`,
      ),
    );
    assert.strictEqual(other.status, 404);
  });
});

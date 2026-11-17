import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, suite, test } from 'vitest';
import type { Tab } from '../../../../../shell/main/toolContract';
import { removeFolder, tempFolder } from '../../../../helpers/tempFolders';
import { forged, viewer } from './viewerFixtures';

suite('Viewer tool turning a file viewed into one edited', () => {
  let opened: string;

  beforeEach(() => {
    opened = tempFolder('viewer');
  });

  afterEach(() => removeFolder(opened));

  test('asks to edit the file of the tab it shows at the byte and in the encoding the page names', async () => {
    const notes = path.join(opened, 'notes.txt');
    fs.writeFileSync(notes, 'one\ntwo\n');
    const { tool, page, send, tabs, edited } = viewer();
    const viewing: Tab = { id: '3', tool: 'viewer', root: notes };
    tabs.push(viewing);
    await tool.show(page, viewing);
    await send({ type: 'editViewed', tab: '3', at: 4, encoding: 'utf-16le' });
    assert.deepStrictEqual(edited, [
      { file: notes, at: { byte: 4, encoding: 'utf-16le' } },
    ]);
  });

  test('edits the file of no tab it does not show, nor one at a place that is no byte or in an encoding it does not know, as the page is not trusted', async () => {
    const notes = path.join(opened, 'notes.txt');
    fs.writeFileSync(notes, 'one\n');
    const { tool, page, send, tabs, edited } = viewer();
    const viewing: Tab = { id: '3', tool: 'viewer', root: notes };
    tabs.push(viewing, { id: '5', tool: 'viewer', root: notes });
    await tool.show(page, viewing);
    await send({ type: 'editViewed', tab: '5', at: 0 });
    await send(forged('{"type":"editViewed","tab":"3","at":-1}'));
    await send(forged('{"type":"editViewed","tab":"3","at":"0"}'));
    await send(
      forged('{"type":"editViewed","tab":"3","at":0,"encoding":"klingon"}'),
    );
    assert.deepStrictEqual(edited, []);
  });

  test('hands the file of a tab closed back to be let go of, as a copy taken out of an archive to view it', async () => {
    const notes = path.join(opened, 'notes.txt');
    fs.writeFileSync(notes, 'one\n');
    const { tool, page, closed } = viewer();
    tool.closed(page, { id: '3', tool: 'viewer', root: notes });
    assert.deepStrictEqual(closed, [notes]);
    assert.deepStrictEqual(page.of('closed'), [{ type: 'closed', tab: '3' }]);
  });
});

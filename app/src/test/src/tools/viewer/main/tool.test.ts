import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, suite, test } from 'vitest';
import type { Tab } from '../../../../../shell/main/toolContract';
import { removeFolder, tempFolder } from '../../../../helpers/tempFolders';
import { ViewerPage, viewer } from './viewerFixtures';
import { pathParts } from '../../../../../lib/shared/pathParts';
import { strings } from '../../../../../lib/shared/strings';
import { viewedFileUrl } from '../../../../../tools/viewer/shared/files';

const hash = '0123456789abcdef0123456789abcdef01234567';
const otherHash = 'fedcba9876543210fedcba9876543210fedcba98';

const versionOf = (root: string): Tab => ({
  id: '3',
  tool: 'viewer',
  root,
  version: { rev: hash, file: root },
});

suite('Viewer tool', () => {
  let opened: string;

  beforeEach(() => {
    opened = tempFolder('viewer');
  });

  afterEach(() => removeFolder(opened));

  test('names a tab after its file, leaving it the icon of the viewer, and gives its folder as the folder of the tab', async () => {
    const notes = path.join(opened, 'notes.txt');
    fs.writeFileSync(notes, 'one');
    const { tool, page } = viewer();
    const viewing: Tab = { id: '3', tool: 'viewer', root: notes };

    assert.deepStrictEqual(tool.names([viewing]).get('3'), {
      name: 'notes.txt',
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

  test('views a version of a file from the copy git makes of it, under the path of the file, which need not be there, the looks of its parts following that path', async () => {
    const copy = path.join(opened, 'copies', 'notes.txt');
    fs.mkdirSync(path.dirname(copy));
    fs.writeFileSync(copy, 'old\ntext\n');
    const notes = path.join(opened, '.gone', 'notes.txt');
    const { tool, page, send, versions } = viewer();
    versions.set(`${hash} ${notes}`, copy);

    await tool.show(page, versionOf(notes));
    assert.deepStrictEqual(page.of('show'), [
      { type: 'show', tab: '3', file: notes, version: hash },
    ]);
    const [viewing] = page.of('viewing');
    assert.deepStrictEqual(
      [viewing?.size, viewing?.hidden],
      [
        9,
        pathParts(notes).map((part) =>
          path.basename(part.path).startsWith('.'),
        ),
      ],
    );
    await send({
      type: 'readRows',
      tab: '3',
      encoding: 'utf-8',
      anchor: 0,
      exact: true,
      before: 0,
      after: 2,
      least: 0,
      request: 1,
    });
    assert.deepStrictEqual(
      page.of('rows').map((answer) => answer.rows.map((row) => row.text)),
      [['old', 'text']],
    );
  });

  test('serves the preview of a version from its copy rather than the file on disk', async () => {
    const copy = path.join(opened, 'copies', 'logo.png');
    fs.mkdirSync(path.dirname(copy));
    fs.writeFileSync(copy, 'old pixels');
    const logo = path.join(opened, 'logo.png');
    fs.writeFileSync(logo, 'new pixels');
    const { tool, page, tabs, versions } = viewer();
    versions.set(`${hash} ${logo}`, copy);
    tabs.push(versionOf(logo));
    await tool.show(page, versionOf(logo));

    const served = await tool.file(
      new URL(`fastforward://app${viewedFileUrl('3', logo)}`),
      null,
    );
    assert.strictEqual(served.status, 200);
    assert.strictEqual(await served.text(), 'old pixels');
  });

  test('says a version is not there to view when git can no longer give it', async () => {
    const notes = path.join(opened, 'notes.txt');
    const { tool, page } = viewer();

    await tool.show(page, versionOf(notes));
    assert.deepStrictEqual(page.of('viewing'), [
      {
        type: 'viewing',
        tab: '3',
        size: undefined,
        error: strings.diff.viewMissing(notes),
      },
    ]);
  });

  test('refuses to edit a version, saying why, as only the file on disk can be edited', async () => {
    const copy = path.join(opened, 'notes.txt');
    fs.writeFileSync(copy, 'old');
    const notes = path.join(opened, 'src', 'notes.txt');
    const { tool, page, tabs, send, versions, edited, notices } = viewer();
    versions.set(`${hash} ${notes}`, copy);
    tabs.push(versionOf(notes));
    await tool.show(page, versionOf(notes));

    await send({ type: 'editViewed', tab: '3', at: 0 });
    assert.deepStrictEqual(edited, []);
    assert.deepStrictEqual(notices, [
      { level: 'error', message: strings.viewer.versionNotEdited(notes) },
    ]);
  });

  test('lists the versions of the file a tab shows once it is shown, those of the file whose history a version is of, saying whether that file is on disk and the index holds a version of its own', async () => {
    const notes = path.join(opened, 'notes.txt');
    fs.writeFileSync(notes, 'one');
    const old = path.join(opened, 'old.txt');
    const { tool, page, histories } = viewer();
    const listed = {
      versions: [
        { rev: hash, path: notes, date: 2000, subject: 'two', gone: false },
        { rev: otherHash, path: old, date: 1000, subject: 'one', gone: false },
      ],
      staged: true,
      changed: false,
    };
    histories.set(notes, listed);

    await tool.show(page, { id: '3', tool: 'viewer', root: notes });
    await tool.show(page, {
      id: '4',
      tool: 'viewer',
      root: old,
      version: { rev: otherHash, file: notes },
    });
    await tool.show(page, {
      id: '5',
      tool: 'viewer',
      root: path.join(opened, 'untracked.txt'),
    });
    assert.deepStrictEqual(page.of('versions'), [
      { type: 'versions', tab: '3', ...listed, onDisk: true },
      { type: 'versions', tab: '4', ...listed, onDisk: true },
    ]);
  });

  test('switches a tab to a version it listed, keeping the file whose history it is, and back to that file on disk, but to no version it did not list or that is gone', async () => {
    const notes = path.join(opened, 'notes.txt');
    fs.writeFileSync(notes, 'one');
    const old = path.join(opened, 'old.txt');
    const copy = path.join(opened, 'copy.txt');
    fs.writeFileSync(copy, 'old');
    const { tool, page, send, tabs, histories, versions, versionsSet } =
      viewer();
    histories.set(notes, {
      versions: [
        { rev: hash, path: notes, date: 3000, subject: 'gone', gone: true },
        { rev: otherHash, path: old, date: 1000, subject: 'one', gone: false },
      ],
      staged: false,
      changed: false,
    });
    versions.set(`${otherHash} ${old}`, copy);
    tabs.push({ id: '3', tool: 'viewer', root: notes });
    await tool.show(page, { id: '3', tool: 'viewer', root: notes });

    await send({ type: 'chooseVersion', tab: '3', rev: hash });
    await send({ type: 'chooseVersion', tab: '3', rev: 'index' });
    await send({ type: 'chooseVersion', tab: '3', rev: 'c'.repeat(40) });
    await send({ type: 'chooseVersion', tab: '3', rev: otherHash });
    await send({ type: 'chooseVersion', tab: '3' });
    assert.deepStrictEqual(versionsSet, [
      ['3', old, { rev: otherHash, file: notes }],
      ['3', notes, undefined],
    ]);
    assert.deepStrictEqual(page.of('show').slice(1), [
      { type: 'show', tab: '3', file: old, version: otherHash },
      { type: 'show', tab: '3', file: notes },
    ]);
  });

  test('opens the diff of the version shown, or of the file on disk, with its history, but of no tab the page does not show', async () => {
    const notes = path.join(opened, 'notes.txt');
    const old = path.join(opened, 'old.txt');
    const { tool, page, send, tabs, comparedHistories } = viewer();
    tabs.push(
      { id: '3', tool: 'viewer', root: notes },
      {
        id: '4',
        tool: 'viewer',
        root: old,
        version: { rev: otherHash, file: notes },
      },
    );
    await tool.show(page, { id: '3', tool: 'viewer', root: notes });
    await send({ type: 'compareVersions', tab: '3' });
    await send({ type: 'compareVersions', tab: '4' });
    await tool.show(page, {
      id: '4',
      tool: 'viewer',
      root: old,
      version: { rev: otherHash, file: notes },
    });
    await send({ type: 'compareVersions', tab: '4' });
    assert.deepStrictEqual(comparedHistories, [
      [notes, undefined],
      [notes, otherHash],
    ]);
  });

  test('names a tab of a version after its file and that version, by its short hash or as the version of the index, to tell it from the tab of the file on disk', () => {
    const notes = path.join(opened, 'notes.txt');
    const { tool } = viewer();
    const names = tool.names([
      versionOf(notes),
      { ...versionOf(notes), id: '4', version: { rev: 'index', file: notes } },
    ]);
    assert.deepStrictEqual(
      [names.get('3'), names.get('4')],
      [
        { name: 'notes.txt', folder: '0123456' },
        { name: 'notes.txt', folder: strings.versions.staged },
      ],
    );
  });

  test('views a file edited in a viewer tab of its own, showing it once at the byte and in the encoding the editor gives, or goes to the tab viewing it already as it was, never to that of a version', async () => {
    const notes = path.join(opened, 'notes.txt');
    fs.writeFileSync(notes, 'one\ntwo\n');
    const { tool, page, tabs, tabsOpened } = viewer();
    tabs.push(versionOf(notes));
    await tool.viewEdited(page, notes, { byte: 4, encoding: 'windows-1250' });
    assert.deepStrictEqual(tabsOpened, [['viewer', [notes], true]]);
    const viewing: Tab = { id: '5', tool: 'viewer', root: notes };
    tabs.push(viewing);
    await tool.show(page, viewing);
    await tool.show(page, viewing);
    await tool.viewEdited(page, notes, { byte: 8 });
    await tool.show(page, viewing);
    assert.deepStrictEqual(page.of('show'), [
      { type: 'show', tab: '5', file: notes, at: 4, encoding: 'windows-1250' },
      { type: 'show', tab: '5', file: notes },
      { type: 'show', tab: '5', file: notes },
    ]);
    assert.strictEqual(tabsOpened.length, 2);
  });
});

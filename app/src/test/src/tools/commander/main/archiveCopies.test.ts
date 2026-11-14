import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ChangeSet } from '@codemirror/state';
import { afterEach, beforeEach, suite, test } from 'vitest';
import type { Tab } from '../../../../../shell/main/shell';
import type { Side } from '../../../../../tools/commander/shared/protocol';
import { strings } from '../../../../../lib/shared/strings';
import { removeFolder, tempFolder } from '../../../../helpers/repositories';
import { waitFor } from '../../../../helpers/fixtures';
import {
  CommanderPage,
  root,
  at,
  file,
  commander,
  tab,
  archiveItem,
  zipped,
} from './commanderFixtures';

suite('Commander tool in archives', () => {
  suite('reading its files', () => {
    let copiesFolder: string;

    beforeEach(() => {
      copiesFolder = tempFolder('archive-copies');
    });

    afterEach(() => {
      for (const copy of fs.readdirSync(copiesFolder, {
        recursive: true,
        encoding: 'utf8',
      })) {
        fs.chmodSync(path.join(copiesFolder, copy), 0o777);
      }
      removeFolder(copiesFolder);
    });

    const inArchive = async () => {
      const made = commander({ [root]: [file('a.zip'), file('notes.txt')] });
      made.archived.set(at('a.zip'), zipped);
      made.copies.folder = copiesFolder;
      await made.tool.show(made.page, tab);
      await made.send({
        type: 'enterArchive',
        tab: '1',
        side: 'right',
        name: 'a.zip',
      });
      return made;
    };

    test('removes the copy a viewer tab showed once the tab is closed, unless another open tab still shows it, and nothing outside the copies of viewed files', async () => {
      const { tool, page, tabs, settled } = await inArchive();
      const copyIn = (named: string) => {
        const copy = path.join(copiesFolder, 'viewed', named, 'a.txt');
        fs.mkdirSync(path.dirname(copy), { recursive: true });
        fs.writeFileSync(copy, 'a');
        return copy;
      };
      const closedAlone = copyIn('alone');
      const shared = copyIn('shared');
      const outside = path.join(copiesFolder, 'outside.txt');
      fs.writeFileSync(outside, 'o');
      tabs.push({ id: '9', tool: 'commander', view: true, root: shared });

      for (const [id, viewedFile] of [
        ['6', closedAlone],
        ['7', shared],
        ['8', outside],
      ] as const) {
        tool.closed(page, {
          id,
          tool: 'commander',
          view: true,
          root: viewedFile,
        });
      }
      await settled();

      assert.ok(!fs.existsSync(path.dirname(closedAlone)));
      assert.ok(fs.existsSync(shared));
      assert.ok(fs.existsSync(outside));
    });

    test('views a file of an archive from a copy kept with the copies of viewed files, named as the file is', async () => {
      const { send, viewed } = await inArchive();
      await send({ type: 'view', tab: '1', side: 'right', name: 'top.txt' });

      const [copy] = viewed;
      assert.ok(copy !== undefined);
      assert.strictEqual(path.basename(copy), 'top.txt');
      assert.strictEqual(
        path.relative(path.join(copiesFolder, 'viewed'), copy).split(path.sep)
          .length,
        2,
      );
      assert.strictEqual(
        fs.readFileSync(copy, 'utf8'),
        'the top.txt of the archive',
      );
    });

    test('opens a file of an archive in the app the system opens it with from a copy, asking once it is saved whether to put it back, putting it back in the dialog of copies once asked to, asking again once saved again and only while the commander is shown, and from a read-only copy for an archive that cannot be changed', async () => {
      const made = commander({ [root]: [file('a.zip')] });
      made.archived.set(at('a.zip'), [...zipped, archiveItem('inner.zip')]);
      made.archived.set(path.join(at('a.zip'), 'inner.zip'), zipped);
      made.copies.folder = copiesFolder;
      const { tool, page, send, opened, watched, change, notices } = made;
      await tool.show(page, tab);
      const opening = (name: string) =>
        send({ type: 'open', tab: '1', side: 'right', name });
      await send({
        type: 'enterArchive',
        tab: '1',
        side: 'right',
        name: 'a.zip',
      });
      await opening('docs');
      await opening('readme.md');

      const [copy] = opened;
      assert.ok(copy !== undefined);
      assert.strictEqual(path.basename(copy), 'readme.md');
      assert.strictEqual(
        fs.readFileSync(copy, 'utf8'),
        'the docs/readme.md of the archive',
      );
      assert.notStrictEqual(fs.statSync(copy).mode & 0o200, 0);
      const holding = path.dirname(copy);
      assert.ok(watched().includes(holding));
      const asked = () => page.of('askUpdate');
      const saved = async (content: string) => {
        fs.writeFileSync(copy, `${content} ${'.'.repeat(asked().length)}`);
        await Promise.all([change(holding), change(holding)]);
      };
      const name = path.join('docs', 'readme.md');

      await change(holding);
      assert.strictEqual(tool.quitNote(), undefined);
      await saved('Changed once.');
      await waitFor(() => asked().length === 1, 'the update to be asked');
      assert.strictEqual(tool.quitNote(), strings.commander.quitDropsChanges);
      await saved('Changed again before an answer.');
      await send({ type: 'updateArchive', ask: 1, update: true });
      await waitFor(() => notices.length === 1, 'the copy to be put back');
      assert.strictEqual(tool.quitNote(), undefined);
      assert.deepStrictEqual(asked(), [
        { type: 'askUpdate', ask: 1, name, archive: 'a.zip' },
      ]);
      assert.deepStrictEqual(made.changedInArchives, [
        ['add', at('a.zip'), ['docs'], holding, ['readme.md']],
      ]);
      assert.strictEqual(
        page
          .of('transfer')
          .find((message) => message.view?.archiveJob === 'update')?.view
          ?.target,
        at('a.zip'),
      );
      assert.deepStrictEqual(notices, [
        {
          level: 'info',
          message: strings.commander.putBack(
            strings.commander.oneItem('readme.md'),
            at('a.zip'),
          ),
        },
      ]);

      await saved('Changed once put back.');
      await waitFor(() => asked().length === 2, 'the update to be asked again');
      await send({ type: 'updateArchive', ask: 2, update: false });
      await made.settled();
      tool.hide(page);
      await saved('Changed while the commander is hidden.');
      await waitFor(
        () => tool.quitNote() === strings.commander.quitDropsChanges,
        'the change to wait for an answer while the commander is hidden',
      );
      assert.strictEqual(asked().length, 2);
      await tool.show(page, tab);
      await waitFor(() => asked().length === 3, 'the update to be asked');
      assert.strictEqual(made.changedInArchives.length, 1);

      await opening('..');
      await send({
        type: 'enterArchive',
        tab: '1',
        side: 'right',
        name: 'inner.zip',
      });
      await opening('top.txt');
      const fromInner = opened.at(-1);
      assert.ok(fromInner !== undefined && fromInner !== copy);
      assert.strictEqual(fs.statSync(fromInner).mode & 0o222, 0);
      assert.ok(!watched().includes(path.dirname(fromInner)));
    });

    test('edits a file of an archive on F4 in a copy kept with the copies of viewed files, putting it back in the dialog of copies each time it is saved, without asking, and edits one of an archive that cannot be changed read-only', async () => {
      const made = commander({ [root]: [file('a.zip')] });
      made.archived.set(at('a.zip'), [...zipped, archiveItem('inner.zip')]);
      made.archived.set(path.join(at('a.zip'), 'inner.zip'), zipped);
      made.copies.folder = copiesFolder;
      const { tool, page, send, edited, tabs, settled } = made;
      await tool.show(page, tab);
      await send({
        type: 'enterArchive',
        tab: '1',
        side: 'right',
        name: 'a.zip',
      });
      await send({
        type: 'editFile',
        tab: '1',
        side: 'right',
        name: 'top.txt',
      });
      const [copy] = edited;
      assert.ok(copy !== undefined);
      assert.strictEqual(path.basename(copy), 'top.txt');
      assert.strictEqual(
        path.relative(path.join(copiesFolder, 'viewed'), copy).split(path.sep)
          .length,
        2,
      );
      const editTab = async (id: string, copied: string) => {
        const editing: Tab = {
          id,
          tool: 'commander',
          root: copied,
          edit: true,
        };
        tabs.push(editing);
        await tool.show(page, editing);
        await send({ type: 'readEdited', tab: id });
        return page.of('editing').findLast((each) => each.tab === id);
      };
      assert.strictEqual((await editTab('7', copy))?.readOnly, undefined);
      const text = page.of('editedText').at(-1)?.shown.text ?? '';
      assert.strictEqual(text, 'the top.txt of the archive');
      const save = async (version: number, insert: string) => {
        await send({
          type: 'editText',
          tab: '7',
          update: {
            version,
            changes: ChangeSet.of(
              { from: 0, insert },
              version === 0 ? text.length : text.length + 9,
            ).toJSON(),
          },
        });
        await send({ type: 'saveText', tab: '7' });
        await settled();
      };
      await save(0, 'Changed: ');
      assert.strictEqual(
        fs.readFileSync(copy, 'utf8'),
        'Changed: the top.txt of the archive',
      );
      assert.deepStrictEqual(made.changedInArchives, [
        ['add', at('a.zip'), [], path.dirname(copy), ['top.txt']],
      ]);
      await save(1, 'Again: ');
      assert.strictEqual(made.changedInArchives.length, 2);
      assert.deepStrictEqual(page.of('askUpdate'), []);

      await tool.show(page, tab);
      await send({ type: 'newFile', tab: '1', side: 'right', name: 'new.txt' });
      const newCopy = edited.at(-1);
      assert.ok(newCopy !== undefined && path.basename(newCopy) === 'new.txt');
      assert.ok(!fs.existsSync(newCopy));
      await editTab('9', newCopy);
      await send({
        type: 'editText',
        tab: '9',
        update: {
          version: 0,
          changes: ChangeSet.of({ from: 0, insert: 'new' }, 0).toJSON(),
        },
      });
      await send({ type: 'saveText', tab: '9' });
      await settled();
      assert.strictEqual(fs.readFileSync(newCopy, 'utf8'), 'new');
      assert.deepStrictEqual(made.changedInArchives.at(-1), [
        'add',
        at('a.zip'),
        [],
        path.dirname(newCopy),
        ['new.txt'],
      ]);

      await tool.show(page, tab);
      await send({
        type: 'enterArchive',
        tab: '1',
        side: 'right',
        name: 'inner.zip',
      });
      await send({
        type: 'editFile',
        tab: '1',
        side: 'right',
        name: 'top.txt',
      });
      const fromInner = edited.at(-1);
      assert.ok(fromInner !== undefined && fromInner !== copy);
      assert.strictEqual((await editTab('8', fromInner))?.readOnly, true);
    });

    test('stops watching a copy opened from an archive once no side of an open tab shows the archive, making it read-only, so a change saved to it is not lost unnoticed', async () => {
      const made = commander({ [root]: [file('a.zip')] });
      made.archived.set(at('a.zip'), zipped);
      made.copies.folder = copiesFolder;
      const { tool, page, send, opened, watched, change } = made;
      await tool.show(page, tab);
      const enter = (side: Side) =>
        send({ type: 'enterArchive', tab: '1', side, name: 'a.zip' });
      const opening = (side: Side, name: string) =>
        send({ type: 'open', tab: '1', side, name });
      await enter('right');
      await enter('left');
      await opening('right', 'top.txt');
      const [copy] = opened;
      assert.ok(copy !== undefined);
      const holding = path.dirname(copy);

      await opening('right', '..');
      assert.ok(watched().includes(holding));
      assert.notStrictEqual(fs.statSync(copy).mode & 0o200, 0);
      await opening('left', 'docs');
      assert.ok(watched().includes(holding));

      await opening('left', '..');
      await opening('left', '..');
      await made.settled();
      assert.ok(!watched().includes(holding));
      assert.strictEqual(fs.statSync(copy).mode & 0o222, 0);

      await enter('right');
      await opening('right', 'top.txt');
      const again = opened.at(-1);
      assert.ok(again !== undefined && again !== copy);
      assert.ok(watched().includes(path.dirname(again)));
      tool.closed(page, tab);
      await made.settled();
      assert.ok(!watched().includes(path.dirname(again)));
      assert.strictEqual(fs.statSync(again).mode & 0o222, 0);
      await change(path.dirname(again));
      assert.deepStrictEqual(page.of('askUpdate'), []);
    });

    test('asks whether to put a changed copy back in one window alone, the one in front while it shows a commander, or else another that shows one', async () => {
      const made = commander({ [root]: [file('a.zip')] });
      made.archived.set(at('a.zip'), zipped);
      made.copies.folder = copiesFolder;
      const { tool, page, send, opened, change, focus } = made;
      const other = new CommanderPage();
      await tool.show(page, tab);
      await tool.show(other, { id: '2', tool: 'commander' });
      focus(other);
      await send({
        type: 'enterArchive',
        tab: '1',
        side: 'right',
        name: 'a.zip',
      });
      await send({ type: 'open', tab: '1', side: 'right', name: 'docs' });
      await send({ type: 'open', tab: '1', side: 'right', name: 'readme.md' });
      const [copy] = opened;
      assert.ok(copy !== undefined);
      const holding = path.dirname(copy);
      await change(holding);
      fs.writeFileSync(copy, 'Changed.');
      await Promise.all([change(holding), change(holding)]);
      await waitFor(
        () => other.of('askUpdate').length === 1,
        'the update to be asked',
      );
      assert.deepStrictEqual(page.of('askUpdate'), []);

      tool.hide(other);
      await tool.show(page, tab);
      assert.strictEqual(page.of('askUpdate').length, 1);
      assert.strictEqual(other.of('askUpdate').length, 1);
    });

    test('puts a copy back where it was opened from, though the side went on to a folder with a file of its name while it was taken out', async () => {
      const made = commander({ [root]: [file('a.zip')] });
      made.archived.set(at('a.zip'), [
        archiveItem('docs/readme.md'),
        archiveItem('notes/readme.md'),
      ]);
      made.copies.folder = copiesFolder;
      const { tool, page, send, opened, change, extractsHeld } = made;
      await tool.show(page, tab);
      const opening = (name: string) =>
        send({ type: 'open', tab: '1', side: 'right', name });
      await send({
        type: 'enterArchive',
        tab: '1',
        side: 'right',
        name: 'a.zip',
      });
      await opening('docs');
      const held = Promise.withResolvers<void>();
      extractsHeld.until = held.promise;

      const readme = opening('readme.md');
      await opening('..');
      await opening('notes');
      held.resolve();
      await readme;
      const [copy] = opened;
      assert.ok(copy !== undefined);
      fs.writeFileSync(copy, 'Changed.');
      await change(path.dirname(copy));
      await waitFor(
        () => page.of('askUpdate').length === 1,
        'the update to be asked',
      );
      await send({ type: 'updateArchive', ask: 1, update: true });
      await waitFor(
        () => made.changedInArchives.length === 1,
        'the copy to be put back',
      );

      assert.strictEqual(
        page.of('askUpdate')[0]?.name,
        path.join('docs', 'readme.md'),
      );
      assert.deepStrictEqual(made.changedInArchives, [
        ['add', at('a.zip'), ['docs'], path.dirname(copy), ['readme.md']],
      ]);
    });

    test('compares a file of an archive with one on disk from a copy of it, the first named the old side', async () => {
      const { send, compared } = await inArchive();
      await send({
        type: 'compare',
        tab: '1',
        files: [
          { side: 'right', folder: at('a.zip'), name: 'top.txt' },
          { side: 'left', folder: root, name: 'notes.txt' },
        ],
      });

      const [comparing] = compared;
      assert.ok(comparing !== undefined);
      assert.strictEqual(
        fs.readFileSync(comparing.old, 'utf8'),
        'the top.txt of the archive',
      );
      assert.strictEqual(comparing.new, at('notes.txt'));
    });

    test('puts copies of the files and folders of an archive asked for on the clipboard, the folders whole', async () => {
      const { send, clipboard } = await inArchive();
      await send({
        type: 'copyToClipboard',
        tab: '1',
        side: 'right',
        names: ['docs', 'top.txt'],
      });

      assert.deepStrictEqual(
        clipboard.files.map((copy) => path.basename(copy)).toSorted(),
        ['docs', 'top.txt'],
      );
      const docs = clipboard.files.find(
        (copy) => path.basename(copy) === 'docs',
      );
      assert.ok(docs !== undefined);
      assert.ok(fs.existsSync(path.join(docs, 'deep', 'notes.md')));
    });
  });
});

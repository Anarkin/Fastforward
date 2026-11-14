import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { ChangeSet } from '@codemirror/state';
import { afterEach, beforeEach, suite, test } from 'vitest';
import type { Tab } from '../../../../../shell/main/shell';
import type { Side } from '../../../../../tools/commander/shared/protocol';
import { thumbnailUrl } from '../../../../../tools/commander/shared/icons';
import type { ElevatedFileSystem } from '../../../../../tools/commander/main/elevated';
import { strings } from '../../../../../lib/shared/strings';
import {
  boxedThumbnailUrl,
  filledThumbnailUrl,
} from '../../../../../lib/shared/images';
import { removeFolder, tempFolder } from '../../../../support/repositories';
import { waitFor } from '../../../../support/fixtures';
import { thumbnailKey } from '../../../../../tools/commander/main/thumbnailStore';
import {
  CommanderPage,
  root,
  at,
  folder,
  file,
  commander,
  plansOf,
  tab,
  archiveItem,
  zipped,
} from './commanderFixtures';

const keyOf = (name: string) =>
  thumbnailKey(path.join(at('a.zip'), name), 1, 0, 144, 1.5);

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

    test('copies the items asked for out of an archive into the folder of the other side, taking them out first and then moving them from there through a transfer, its popup naming the items of the archive', async () => {
      const { send, page, transfers } = await inArchive();
      await send({
        type: 'transfer',
        tab: '1',
        side: 'right',
        names: ['docs', 'top.txt'],
        target: root,
        move: false,
      });
      await waitFor(
        () => plansOf(transfers).length === 1,
        'the copy to start once the items are taken out',
      );

      const [moving] = plansOf(transfers);
      assert.ok(moving !== undefined);
      assert.deepStrictEqual(
        [
          moving.sources.map((source) => path.basename(source)).toSorted(),
          moving.target,
          moving.move,
        ],
        [['docs', 'top.txt'], root, true],
      );
      assert.ok(
        moving.sources.every((source) => source.startsWith(copiesFolder)),
      );
      assert.ok(
        fs.existsSync(
          path.join(path.dirname(moving.sources[0] ?? ''), 'docs', 'deep'),
        ),
      );
      const shown = page
        .of('transfer')
        .findLast((message) => message.view !== undefined)?.view;
      assert.deepStrictEqual(
        [shown?.move, shown?.items, shown?.target],
        [false, 2, root],
      );
    });

    test('copies and moves nothing out of an archive into a folder read as administrator, saying so, and takes nothing out', async () => {
      const helper: ElevatedFileSystem = {
        list: () => Promise.resolve([]),
        drives: () => Promise.resolve([]),
        watch: () => () => {},
        closed: new Promise(() => {}),
        close: () => {},
      };
      const made = commander(
        {
          [root]: [file('a.zip'), folder('Config.Msi')],
          [at('Config.Msi')]: Object.assign(new Error('denied'), {
            code: 'EPERM',
          }),
        },
        [],
        () => Promise.resolve(helper),
      );
      made.archived.set(at('a.zip'), zipped);
      made.copies.folder = copiesFolder;
      const { tool, page, send, notices, transfers, extracted } = made;
      await tool.show(page, tab);
      await send({
        type: 'enterArchive',
        tab: '1',
        side: 'right',
        name: 'a.zip',
      });
      await send({ type: 'open', tab: '1', side: 'left', name: 'Config.Msi' });
      await send({ type: 'elevate', tab: '1', side: 'left' });

      for (const move of [false, true]) {
        await send({
          type: 'transfer',
          tab: '1',
          side: 'right',
          names: ['top.txt'],
          target: at('Config.Msi'),
          move,
        });
      }

      assert.deepStrictEqual(plansOf(transfers), []);
      assert.deepStrictEqual(extracted, []);
      assert.deepStrictEqual(notices, [
        { level: 'error', message: strings.commander.transferAsAdministrator },
        { level: 'error', message: strings.commander.transferAsAdministrator },
      ]);
    });

    test('moves the items asked for out of an archive into the folder of the other side, deleting them from the archive once the transfer moved them and reading it again, and moves nothing out of an archive inside another, saying it cannot be changed', async () => {
      const made = commander({ [root]: [file('a.zip')] });
      made.archived.set(at('a.zip'), [...zipped, archiveItem('inner.zip')]);
      made.archived.set(path.join(at('a.zip'), 'inner.zip'), zipped);
      made.copies.folder = copiesFolder;
      await made.tool.show(made.page, tab);
      const { send, page, transfers, removedFromArchives, notices } = made;
      await send({
        type: 'enterArchive',
        tab: '1',
        side: 'right',
        name: 'a.zip',
      });
      const listed = page.of('listing').length;
      const moving = (names: readonly string[]) =>
        send({
          type: 'transfer',
          tab: '1',
          side: 'right',
          names,
          target: root,
          move: true,
        });

      await moving(['docs', 'top.txt']);
      await waitFor(
        () => plansOf(transfers).length === 1,
        'the move to start once the items are taken out',
      );
      const shown = page
        .of('transfer')
        .findLast((message) => message.view !== undefined)?.view;
      assert.deepStrictEqual(
        [shown?.move, shown?.items, shown?.target],
        [true, 2, root],
      );
      for (const source of plansOf(transfers)[0]?.sources ?? []) {
        fs.rmSync(source, { recursive: true, force: true });
      }
      transfers[0]?.listener.event({ type: 'done', stopped: false });
      await waitFor(
        () => removedFromArchives.length === 1,
        'what was moved to be deleted from the archive',
      );
      await waitFor(
        () => page.of('listing').length > listed,
        'the archive to be read again',
      );
      await send({
        type: 'enterArchive',
        tab: '1',
        side: 'right',
        name: 'inner.zip',
      });
      await moving(['top.txt']);

      assert.deepStrictEqual(removedFromArchives, [
        [at('a.zip'), ['docs', 'top.txt']],
      ]);
      assert.deepStrictEqual(notices, [
        {
          level: 'error',
          message: strings.commander.archiveUnchangeable('inner.zip'),
        },
      ]);
      assert.strictEqual(plansOf(transfers).length, 1);
    });

    const betweenArchives = async () => {
      const made = commander({ [root]: [file('a.zip'), file('b.7z')] });
      made.archived.set(at('a.zip'), [
        ...zipped,
        archiveItem('docs/top.txt'),
        archiveItem('inner.zip'),
      ]);
      made.archived.set(path.join(at('a.zip'), 'inner.zip'), zipped);
      made.archived.set(at('b.7z'), [archiveItem('into/top.txt')]);
      made.copies.folder = copiesFolder;
      await made.tool.show(made.page, tab);
      const entering = (side: Side, name: string) =>
        made.send({ type: 'enterArchive', tab: '1', side, name });
      await entering('left', 'a.zip');
      await entering('right', 'b.7z');
      await made.send({ type: 'open', tab: '1', side: 'right', name: 'into' });
      const transfer = (
        names: readonly string[],
        move: boolean,
        {
          existing,
          from = at('a.zip'),
          target = path.join(at('b.7z'), 'into'),
        }: {
          readonly existing?: 'replace' | 'skip';
          readonly from?: string;
          readonly target?: string;
        } = {},
      ) =>
        made.send({
          type: 'transfer',
          tab: '1',
          side: 'left',
          folder: from,
          names,
          target,
          move,
          ...(existing !== undefined && { existing }),
        });
      const added = () =>
        made.changedInArchives.map((change) =>
          Array.isArray(change)
            ? [change[0], change[1], change[2], change[4]]
            : change,
        );
      return { ...made, entering, transfer, added };
    };

    test('copies and moves items from an archive on one side into the folder of an archive on the other, only with an answer about items there already, skipping or replacing them as answered, and deletes those of a move from the first once added', async () => {
      const { transfer, added, removedFromArchives, notices, page } =
        await betweenArchives();

      await transfer(['docs', 'top.txt'], false);
      assert.deepStrictEqual(
        page.of('askExisting').map((message) => message.existing),
        [['top.txt']],
      );
      await transfer(['docs', 'top.txt'], false, { existing: 'skip' });
      await waitFor(() => added().length === 1, 'the copy to be added');
      await transfer(['top.txt'], true, { existing: 'replace' });
      await waitFor(
        () => removedFromArchives.length === 1,
        'the moved item to be deleted from the first archive',
      );

      assert.deepStrictEqual(added(), [
        ['add', at('b.7z'), ['into'], ['docs']],
        ['add', at('b.7z'), ['into'], ['top.txt']],
      ]);
      assert.deepStrictEqual(removedFromArchives, [[at('a.zip'), ['top.txt']]]);
      const moving = page
        .of('transfer')
        .find((message) => message.view?.archiveJob === 'moveIn')?.view;
      assert.deepStrictEqual(
        [moving?.move, moving?.items, moving?.target],
        [true, 1, path.join(at('b.7z'), 'into')],
      );
      assert.deepStrictEqual(notices, []);
    });

    test('copies out of an archive inside another into an archive but moves nothing out of it, and refuses an item into itself or the folder it is in within one archive, and files of one name listed flat', async () => {
      const {
        send,
        entering,
        transfer,
        added,
        removedFromArchives,
        notices,
        page,
      } = await betweenArchives();
      const inner = path.join(at('a.zip'), 'inner.zip');
      await entering('left', 'inner.zip');

      await transfer(['top.txt'], true, { existing: 'replace', from: inner });
      await transfer(['docs'], false, { from: inner });
      await waitFor(() => added().length === 1, 'the copy to be added');
      await send({ type: 'open', tab: '1', side: 'left', name: '..' });
      await send({ type: 'open', tab: '1', side: 'right', name: '..' });
      await send({ type: 'open', tab: '1', side: 'right', name: '..' });
      await entering('right', 'a.zip');
      await send({ type: 'open', tab: '1', side: 'right', name: 'docs' });
      await transfer(['docs'], false, {
        target: path.join(at('a.zip'), 'docs'),
      });
      await send({ type: 'open', tab: '1', side: 'right', name: '..' });
      await transfer(['top.txt'], false, { target: at('a.zip') });
      await send({ type: 'flat', tab: '1', side: 'left', flat: true });
      await waitFor(
        () => page.of('flatFiles').length > 0,
        'the archive to be listed flat',
      );
      await send({ type: 'open', tab: '1', side: 'right', name: '..' });
      await entering('right', 'b.7z');
      await transfer(['top.txt', path.join('docs', 'top.txt')], false, {
        existing: 'replace',
        target: at('b.7z'),
      });

      assert.deepStrictEqual(added(), [
        ['add', at('b.7z'), ['into'], ['docs']],
      ]);
      assert.deepStrictEqual(removedFromArchives, []);
      assert.deepStrictEqual(notices, [
        {
          level: 'error',
          message: strings.commander.archiveUnchangeable('inner.zip'),
        },
        { level: 'error', message: strings.commander.intoItself('docs') },
        { level: 'error', message: strings.commander.alreadyIn(at('a.zip')) },
        { level: 'error', message: strings.commander.namesAlike('top.txt') },
      ]);
    });

    test('lists the files of every folder of an archive flat, watching the archive, and reads them and copies them out from copies taken out without their folders', async () => {
      const { send, page, viewed, transfers, watched } = await inArchive();
      await send({ type: 'flat', tab: '1', side: 'right', flat: true });
      const flatNames = () =>
        page
          .of('flatFiles')
          .flatMap((message) =>
            message.folders.flatMap((listed) =>
              listed.entries.map((entry) => `${listed.under}${entry.name}`),
            ),
          )
          .toSorted();
      const deep = ['docs', 'deep', 'notes.md'].join(path.sep);
      const readme = ['docs', 'readme.md'].join(path.sep);
      await waitFor(
        () => flatNames().length === 3,
        'the files of the archive listed flat',
      );
      assert.deepStrictEqual(flatNames(), [deep, readme, 'top.txt'].toSorted());
      assert.ok(watched().includes(at('a.zip')));

      await send({ type: 'view', tab: '1', side: 'right', name: deep });
      const [copy] = viewed;
      assert.ok(copy !== undefined);
      assert.strictEqual(
        fs.readFileSync(copy, 'utf8'),
        'the docs/deep/notes.md of the archive',
      );

      await send({
        type: 'transfer',
        tab: '1',
        side: 'right',
        names: [readme, 'top.txt'],
        target: root,
        move: false,
      });
      await waitFor(
        () => plansOf(transfers).length === 1,
        'the copy to start once the files are taken out',
      );
      const [moving] = plansOf(transfers);
      assert.deepStrictEqual(
        new Set(moving?.sources.map((source) => path.dirname(source))).size,
        1,
      );
      assert.deepStrictEqual(
        moving?.sources.map((source) => path.basename(source)).toSorted(),
        ['readme.md', 'top.txt'],
      );
    });

    test('asks for the password of an encrypted file before reading it, again when it was wrong, and reads nothing when none is given', async () => {
      const { page, send, notices, archived, secrets, viewed } =
        await inArchive();
      archived.set(at('a.zip'), [
        ...zipped,
        { ...archiveItem('secret.txt'), encrypted: true },
      ]);
      secrets.set(at('a.zip'), 'right');
      await send({ type: 'reread', tab: '1', side: 'right' });
      const asked = () => page.of('askPassword');
      const answer = (password?: string) =>
        send({
          type: 'password',
          ask: asked().at(-1)?.ask ?? 0,
          ...(password !== undefined && { password }),
        });

      const viewing = send({
        type: 'view',
        tab: '1',
        side: 'right',
        name: 'secret.txt',
      });
      await waitFor(() => asked().length === 1, 'the password to be asked');
      await answer('wrong');
      await waitFor(() => asked().length === 2, 'the password asked again');
      await answer('right');
      await viewing;
      assert.deepStrictEqual(
        asked().map(({ name, wrong }) => [name, wrong]),
        [
          ['a.zip', false],
          ['a.zip', true],
        ],
      );
      assert.strictEqual(path.basename(viewed[0] ?? ''), 'secret.txt');

      await send({ type: 'view', tab: '1', side: 'right', name: 'secret.txt' });
      assert.strictEqual(asked().length, 2);
      assert.strictEqual(viewed.length, 2);
      assert.deepStrictEqual(notices, []);
    });

    test('gives up an earlier question for a password once another is asked, as the page shows one at a time, ignoring a late answer to it', async () => {
      const { page, send, archived, secrets, viewed } = await inArchive();
      archived.set(at('a.zip'), [
        ...zipped,
        { ...archiveItem('secret.txt'), encrypted: true },
      ]);
      secrets.set(at('a.zip'), 'right');
      await send({ type: 'reread', tab: '1', side: 'right' });
      const asked = () => page.of('askPassword');
      const view = () =>
        send({ type: 'view', tab: '1', side: 'right', name: 'secret.txt' });

      const first = view();
      await waitFor(() => asked().length === 1, 'the first question');
      const second = view();
      await waitFor(() => asked().length === 2, 'the second question');
      await first;
      await send({
        type: 'password',
        ask: asked()[0]?.ask ?? 0,
        password: 'right',
      });
      assert.deepStrictEqual(viewed, []);
      await send({
        type: 'password',
        ask: asked()[1]?.ask ?? 0,
        password: 'right',
      });
      await second;
      assert.strictEqual(viewed.length, 1);
    });

    test('keeps a question for a password while the page of another window loads, giving it up once the page asking is gone', async () => {
      const { tool, page, send, archived, secrets, viewed } = await inArchive();
      archived.set(at('a.zip'), [
        ...zipped,
        { ...archiveItem('secret.txt'), encrypted: true },
      ]);
      secrets.set(at('a.zip'), 'right');
      await send({ type: 'reread', tab: '1', side: 'right' });
      const asked = () => page.of('askPassword');
      const view = () =>
        send({ type: 'view', tab: '1', side: 'right', name: 'secret.txt' });

      const first = view();
      await waitFor(() => asked().length === 1, 'the first question');
      tool.ready(new CommanderPage());
      await send({
        type: 'password',
        ask: asked()[0]?.ask ?? 0,
        password: 'right',
      });
      await first;
      assert.strictEqual(viewed.length, 1);

      secrets.set(at('a.zip'), 'other');
      const second = view();
      await waitFor(() => asked().length === 2, 'the second question');
      page.disposed = true;
      tool.ready(new CommanderPage());
      await second;
      assert.strictEqual(viewed.length, 1);
    });

    test('asks for passwords in two windows at once, each keeping its question', async () => {
      const made = commander({ [root]: [file('a.zip')] });
      made.archived.set(at('a.zip'), [
        ...zipped,
        { ...archiveItem('secret.txt'), encrypted: true },
      ]);
      made.secrets.set(at('a.zip'), 'right');
      made.copies.folder = copiesFolder;
      const { tool, page, send, viewed } = made;
      const other = new CommanderPage();
      await tool.show(page, tab);
      await tool.show(other, { id: '2', tool: 'commander' });
      for (const [id, from] of [
        ['1', page],
        ['2', other],
      ] as const) {
        await send(
          {
            type: 'enterArchive',
            tab: id,
            side: 'right',
            name: 'a.zip',
            folder: root,
          },
          from,
        );
      }
      const view = (id: string, from: CommanderPage) =>
        send(
          {
            type: 'view',
            tab: id,
            side: 'right',
            name: 'secret.txt',
            folder: at('a.zip'),
          },
          from,
        );

      const first = view('1', page);
      await waitFor(
        () => page.of('askPassword').length === 1,
        'the first question',
      );
      const second = view('2', other);
      await waitFor(
        () => other.of('askPassword').length === 1,
        'the second question',
      );
      for (const from of [page, other]) {
        await send(
          {
            type: 'password',
            ask: from.of('askPassword')[0]?.ask ?? 0,
            password: 'right',
          },
          from,
        );
      }
      await Promise.all([first, second]);
      assert.strictEqual(viewed.length, 2);
    });

    test('copies nothing out of an archive when the password of its encrypted files is not given, and says why nothing could be taken out of an archive', async () => {
      const {
        page,
        send,
        notices,
        archived,
        secrets,
        copies,
        opened,
        transfers,
      } = await inArchive();
      archived.set(at('a.zip'), [
        ...zipped,
        { ...archiveItem('docs/secret.txt'), encrypted: true },
      ]);
      secrets.set(at('a.zip'), 'right');
      await send({ type: 'reread', tab: '1', side: 'right' });

      const copying = send({
        type: 'transfer',
        tab: '1',
        side: 'right',
        names: ['docs'],
        target: root,
        move: false,
      });
      await waitFor(
        () => page.of('askPassword').length === 1,
        'the password to be asked for a folder holding an encrypted file',
      );
      await send({
        type: 'password',
        ask: page.of('askPassword')[0]?.ask ?? 0,
      });
      await copying;
      assert.strictEqual(transfers.length, 0);

      copies.refused = 'Data Error';
      await send({ type: 'open', tab: '1', side: 'right', name: 'top.txt' });
      assert.deepStrictEqual(notices, [
        {
          level: 'error',
          message: strings.commander.couldNotExtract('Data Error'),
        },
      ]);
      assert.deepStrictEqual(opened, []);
    });

    test('serves the images of an archive for their thumbnails from copies taken out of it together, each once, removing them once read, an encrypted one only once its password is known', async () => {
      const {
        tool,
        page,
        send,
        archived,
        copies,
        extracted,
        passwords,
        secrets,
        thumbnails,
      } = commander({ [root]: [file('a.zip')] });
      copies.folder = copiesFolder;
      archived.set(at('a.zip'), [
        ...zipped,
        archiveItem('a.png'),
        archiveItem('pics/b.png'),
        { ...archiveItem('secret.png'), encrypted: true },
      ]);
      secrets.set(at('a.zip'), 'right');
      await tool.show(page, tab);
      await send({
        type: 'enterArchive',
        tab: '1',
        side: 'right',
        name: 'a.zip',
      });
      await send({ type: 'flat', tab: '1', side: 'right', flat: true });
      await waitFor(
        () =>
          page
            .of('flatFiles')
            .some((message) =>
              message.folders.some((listed) =>
                listed.entries.some((entry) => entry.name === 'b.png'),
              ),
            ),
        'the image in a folder of the archive to be listed flat',
      );
      const before = fs.readdirSync(copiesFolder);
      const thumbnail = async (name: string) => {
        const response = await tool.thumbnail(
          new URL(
            `fastforward://app${thumbnailUrl({ tab: '1', side: 'right', folder: at('a.zip'), name }, '1:0')}`,
          ),
        );
        return response.ok
          ? [response.headers.get('content-type'), await response.text()]
          : response.status;
      };

      assert.deepStrictEqual(
        await Promise.all(
          ['a.png', path.join('pics', 'b.png'), 'a.png'].map(thumbnail),
        ),
        [
          ['image/png', 'the a.png of the archive'],
          ['image/png', 'the pics/b.png of the archive'],
          ['image/png', 'the a.png of the archive'],
        ],
      );
      assert.strictEqual(await thumbnail('secret.png'), 404);
      assert.strictEqual(await thumbnail('top.txt'), 404);
      assert.deepStrictEqual(extracted, [['a.png', 'pics/b.png']]);
      const webp = new Uint8Array(Buffer.from('RIFF    WEBPVP8 made'));
      for (const name of ['a.png', 'secret.png']) {
        await send({
          type: 'saveThumbnail',
          tab: '1',
          side: 'right',
          folder: at('a.zip'),
          name,
          box: 144,
          pixelRatio: 1.5,
          bytes: webp,
        });
      }
      assert.deepStrictEqual([...thumbnails.keys()], [keyOf('a.png')]);
      thumbnails.set(keyOf('secret.png'), webp);
      const cached = await tool.thumbnail(
        new URL(
          `fastforward://app${thumbnailUrl({ tab: '1', side: 'right', folder: at('a.zip'), name: 'secret.png' }, '1:0')}&box=144&ratio=1.5`,
        ),
      );
      assert.strictEqual(cached.status, 404);
      passwords.set(at('a.zip'), 'right');
      assert.deepStrictEqual(await thumbnail('secret.png'), [
        'image/png',
        'the secret.png of the archive',
      ]);
      assert.deepStrictEqual(fs.readdirSync(copiesFolder), before);
    });

    test('makes no thumbnail in the background of an image in an archive kept online only, as reading it would download the archive, asking about the archive rather than a path inside it', async () => {
      const { tool, page, send, archived, streamed } = commander({
        [root]: [file('a.zip'), file('nested.zip')],
      });
      archived.set(at('a.zip'), [archiveItem('a.png')]);
      await tool.show(page, tab);
      await send({
        type: 'enterArchive',
        tab: '1',
        side: 'right',
        name: 'a.zip',
      });
      streamed.add(at('a.zip'));
      const filled = async () => {
        const response = await tool.thumbnail(
          new URL(
            `fastforward://app${filledThumbnailUrl(boxedThumbnailUrl(thumbnailUrl({ tab: '1', side: 'right', folder: at('a.zip'), name: 'a.png' }, '1:0'), 144, 1.5))}`,
          ),
        );
        await response.body?.cancel();
        return response.status;
      };
      assert.strictEqual(await filled(), 409);
      streamed.clear();
      streamed.add(path.join(at('a.zip'), 'a.png'));
      assert.notStrictEqual(await filled(), 409);
    });
  });
});

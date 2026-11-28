import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { suite, test } from 'vitest';
import { strings } from '../../../../../lib/shared/strings';
import { waitFor } from '../../../../helpers/fixtures';
import { commander, tab } from './commanderFixtures';
import { CommanderPage } from './fakePage';
import { root, at, file } from './entryFixtures';
import { withCopiesFolder, commanderInArchive } from './copiesFixtures';
import { archiveItem, zipped } from './fakeArchives';

suite('Commander tool in archives', () => {
  suite('reading its files', () => {
    let copiesFolder: string;

    withCopiesFolder((made) => {
      copiesFolder = made;
    });

    const inArchive = () => commanderInArchive(copiesFolder);

    test('asks for the password of an encrypted file before reading it, naming its archive by its whole path, again when it was wrong, and reads nothing when none is given', async () => {
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
          [at('a.zip'), false],
          [at('a.zip'), true],
        ],
      );
      assert.strictEqual(path.basename(viewed[0] ?? ''), 'secret.txt');

      await send({ type: 'view', tab: '1', side: 'right', name: 'secret.txt' });
      assert.strictEqual(asked().length, 2);
      assert.strictEqual(viewed.length, 2);
      assert.deepStrictEqual(notices, []);
    });

    test('views the file taken out with the password once one was wrong, rather than the empty file the wrong one left, as 7-Zip writes the next beside it under another name and Edit saved the empty one over the entry', async () => {
      const made = await inArchive();
      const { page, send, archived, secrets, viewed, copies } = made;
      copies.wrongPasswordLeavesEmpty = true;
      archived.set(at('a.zip'), [
        ...zipped,
        { ...archiveItem('secret.txt'), encrypted: true },
      ]);
      secrets.set(at('a.zip'), 'right');
      await send({ type: 'reread', tab: '1', side: 'right' });
      const asked = () => page.of('askPassword');
      const answer = (password: string) =>
        send({ type: 'password', ask: asked().at(-1)?.ask ?? 0, password });

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

      const [copy] = viewed;
      assert.ok(copy !== undefined);
      assert.strictEqual(path.basename(copy), 'secret.txt');
      assert.notStrictEqual(fs.readFileSync(copy, 'utf8'), '');
      assert.deepStrictEqual(fs.readdirSync(path.dirname(copy)), [
        'secret.txt',
      ]);
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
  });
});

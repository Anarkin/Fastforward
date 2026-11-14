import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterEach, beforeEach, suite, test } from 'vitest';
import { thumbnailUrl } from '../../../../../tools/commander/shared/icons';
import { strings } from '../../../../../lib/shared/strings';
import {
  boxedThumbnailUrl,
  filledThumbnailUrl,
} from '../../../../../lib/shared/images';
import { removeFolder, tempFolder } from '../../../../helpers/repositories';
import { waitFor } from '../../../../helpers/fixtures';
import { thumbnailKey } from '../../../../../tools/commander/main/thumbnailStore';
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

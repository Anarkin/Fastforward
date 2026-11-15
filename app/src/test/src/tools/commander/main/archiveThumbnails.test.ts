import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { suite, test } from 'vitest';
import {
  thumbnailUrl,
  boxedThumbnailUrl,
  filledThumbnailUrl,
} from '../../../../../tools/commander/shared/thumbnails';
import { waitFor } from '../../../../helpers/fixtures';
import { thumbnailKey } from '../../../../../tools/commander/main/thumbnailStore';
import { commander, tab } from './commanderFixtures';
import { root, at, file } from './entryFixtures';
import { withCopiesFolder } from './copiesFixtures';
import { archiveItem, zipped } from './fakeArchives';

const keyOf = (name: string) =>
  thumbnailKey(path.join(at('a.zip'), name), 1, 0, 144, 1.5);

suite('Commander tool in archives', () => {
  suite('reading its files', () => {
    let copiesFolder: string;

    withCopiesFolder((made) => {
      copiesFolder = made;
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

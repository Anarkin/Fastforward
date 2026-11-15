import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterAll, beforeAll, suite, test } from 'vitest';
import { tabsKey } from '../../../../../shell/main/storage';
import { plainOf } from '../../../../../lib/shared/sentences';
import { strings } from '../../../../../lib/shared/strings';
import { imageUrl, maxImageSize } from '../../../../../tools/git/shared/images';
import { soloKey } from '../../../../../tools/git/main/storage';
import {
  removeFolder,
  tempFolder,
  tempRepository,
  type TempRepository,
} from '../../../../helpers/repositories';
import {
  recordingLog,
  failOnErrorsLogged,
  takeErrorsLogged,
} from '../../../../helpers/stub';
import { closeViews, withView, gitState } from '../../../../helpers/harness';
import { fortyLines } from '../../../../helpers/gitFixtures';
import { FakeHost } from '../../../../helpers/fakeHost';

const url = (root: string, file: string, id: string, disk = false) =>
  new URL(imageUrl({ root, path: file, id, disk }), 'fastforward://app');

suite('Git tool viewing files', () => {
  let folder: string;
  let other: string;
  let long: TempRepository;

  const { log, error: logged } = recordingLog();
  failOnErrorsLogged(logged);

  beforeAll(async () => {
    folder = tempFolder('file-views');
    const otherRepository = await tempRepository(path.join(folder, 'other'));
    await otherRepository.commit('other');
    other = otherRepository.root;
    long = await tempRepository(path.join(folder, 'long'));
    await long.commit('first', {
      'a.txt': fortyLines(-1),
      'b.txt': fortyLines(-1),
    });
    await long.commit('second', {
      'a.txt': fortyLines(19),
      'b.txt': fortyLines(19),
    });
  });

  afterAll(async () => {
    await closeViews();
    removeFolder(folder);
  });

  test('opens a file of a diff in a viewer tab of its own, from the working tree where it is and from a commit as a copy of its blob, and says why not for a file it can not open', async () => {
    const blob = (await long.git('rev-parse', 'HEAD~1:a.txt')).trim();
    const viewing = async (file: string, fromBlob?: string) => {
      let seen = { viewers: [] as string[], notices: [] as string[] };
      await withView(log, [long.root, other], async (view) => {
        await view.connection.receive({
          type: 'viewFile',
          root: long.root,
          path: file,
          ...(fromBlob === undefined ? {} : { blob: fromBlob }),
        });
        const tabs = view.store.get(tabsKey);
        seen = {
          viewers: Array.isArray(tabs)
            ? tabs.flatMap((tab: unknown) =>
                typeof tab === 'object' &&
                tab !== null &&
                'view' in tab &&
                tab.view === true &&
                'root' in tab &&
                typeof tab.root === 'string'
                  ? [tab.root]
                  : [],
              )
            : [],
          notices: view.page.messages.flatMap((message) =>
            message.type === 'notice' ? [plainOf(message.message)] : [],
          ),
        };
      });
      return seen;
    };

    assert.deepStrictEqual((await viewing('a.txt')).viewers, [
      path.join(long.root, 'a.txt'),
    ]);
    const copy = path.join(new FakeHost().viewedFiles, blob, 'a.txt');
    assert.deepStrictEqual((await viewing('a.txt', blob)).viewers, [copy]);
    assert.strictEqual(fs.readFileSync(copy, 'utf8'), fortyLines(-1));
    assert.deepStrictEqual(await viewing('../outside.txt'), {
      viewers: [],
      notices: [
        plainOf(
          strings.diff.couldNotView(
            '../outside.txt',
            strings.errors.outsideRepository('../outside.txt'),
          ),
        ),
      ],
    });
    assert.deepStrictEqual(await viewing('gone.txt'), {
      viewers: [],
      notices: [plainOf(strings.diff.viewMissing('gone.txt'))],
    });
  });

  suite('Images', () => {
    let images: TempRepository;
    const pixel = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 1]);

    beforeAll(async () => {
      images = await tempRepository(path.join(folder, 'images'));
      fs.writeFileSync(path.join(images.root, 'pixel.png'), pixel);
      fs.writeFileSync(path.join(images.root, 'data.bin'), pixel);
      await images.git('add', '.');
      await images.git('commit', '-m', 'images');
    });

    test('serves the images of the repositories open, telling one too large to preview from one it cannot serve', async () => {
      const [object] = await images.resolve('HEAD:pixel.png');
      const [data] = await images.resolve('HEAD:data.bin');
      const exclude = path.join(images.root, '.git', 'info', 'exclude');
      fs.mkdirSync(path.dirname(exclude), { recursive: true });
      fs.appendFileSync(exclude, '/large.png\n');
      const large = path.join(images.root, 'large.png');
      fs.writeFileSync(large, '');
      fs.truncateSync(large, maxImageSize + 1);
      try {
        await withView(log, [images.root], async ({ view }) => {
          const shown = await view.image(url(images.root, 'pixel.png', object));
          assert.strictEqual(shown.status, 200);
          assert.strictEqual(shown.headers.get('content-type'), 'image/png');
          assert.deepStrictEqual(Buffer.from(await shown.arrayBuffer()), pixel);
          const onDisk = await view.image(
            url(images.root, 'pixel.png', 'any', true),
          );
          assert.deepStrictEqual(
            Buffer.from(await onDisk.arrayBuffer()),
            pixel,
          );
          assert.strictEqual(
            (await view.image(url(images.root, 'large.png', 'any', true)))
              .status,
            413,
          );

          for (const unserved of [
            url(images.root, 'data.bin', data),
            url(images.root, 'gone.png', 'any', true),
            url(other, 'pixel.png', object),
          ]) {
            assert.strictEqual((await view.image(unserved)).status, 404);
          }
        });
      } finally {
        fs.rmSync(large);
      }
    });

    test('serves no images from folders the page names that are not open, even after the page sets their Solo', async () => {
      const plain = path.join(folder, 'plain-images');
      fs.mkdirSync(plain, { recursive: true });
      fs.writeFileSync(path.join(plain, 'pixel.png'), pixel);
      const unopened = path.join(other, 'pixel.png');
      fs.writeFileSync(unopened, pixel);
      try {
        await withView(
          log,
          [images.root],
          async ({ view, connection, store }) => {
            for (const root of [plain, other]) {
              await connection.receive({ type: 'setSolo', root, solo: true });
              assert.strictEqual(
                (await view.image(url(root, 'pixel.png', 'any', true))).status,
                404,
              );
            }
            assert.deepStrictEqual(gitState(store).get(soloKey) ?? {}, {});
          },
        );
      } finally {
        fs.rmSync(unopened);
      }
    });

    test('logs which image it failed to read', async () => {
      const gone = await tempRepository(path.join(folder, 'gone-images'));
      fs.writeFileSync(path.join(gone.root, 'pixel.png'), pixel);
      await gone.git('add', '.');
      await gone.git('commit', '-m', 'images');
      const [object] = await gone.resolve('HEAD:pixel.png');
      await withView(log, [gone.root], async ({ view }) => {
        await view.idle();
        fs.rmSync(gone.root, { recursive: true, force: true });
        assert.strictEqual(
          (await view.image(url(gone.root, 'pixel.png', object))).status,
          500,
        );
      });
      takeErrorsLogged(
        logged,
        /^Reading the image pixel\.png failed$/,
        /ENOENT/,
      );
    });
  });
});

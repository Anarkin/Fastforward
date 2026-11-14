import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterAll, beforeAll, suite, test } from 'vitest';
import { workingTreeHash } from '../../../../../../tools/git/shared/protocol';
import {
  imageUrl,
  maxImageSize,
} from '../../../../../../tools/git/shared/images';
import { soloKey } from '../../../../../../tools/git/main/storage';
import {
  removeFolder,
  tempFolder,
  tempRepository,
  type TempRepository,
} from '../../../../../helpers/repositories';
import { recordingLog } from '../../../../../helpers/stub';
import {
  closeViews,
  failOnErrorsLogged,
  numberedLines,
  takeErrorsLogged,
  withView,
  gitState,
} from '../../../../../helpers/harness';
import { fortyLines } from '../../../../../helpers/gitFixtures';

const url = (root: string, file: string, id: string, disk = false) =>
  new URL(imageUrl({ root, path: file, id, disk }), 'fastforward://app');

suite('Git tool showing diffs', () => {
  let folder: string;
  let other: string;
  let long: TempRepository;
  let spaced: TempRepository;

  const { log, error: logged } = recordingLog();
  failOnErrorsLogged(logged);

  beforeAll(async () => {
    folder = tempFolder('diffs');
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
    spaced = await tempRepository(path.join(folder, 'spaced'));
    await spaced.commit('first', { 'a.txt': 'one\ntwo\n' });
    await spaced.commit('indent', { 'a.txt': '  one\ntwo\n' });
  });

  afterAll(async () => {
    await closeViews();
    removeFolder(folder);
  });

  suite('with a commit renaming a file beside others', () => {
    let renamed: TempRepository;
    let hash: string;

    beforeAll(async () => {
      renamed = await tempRepository(path.join(folder, 'renamed'));
      const lines = Array.from({ length: 20 }, (_, index) => `line ${index}`);
      await renamed.commit('old', {
        'old.txt': lines.join('\n'),
        'other.txt': 'one\n',
      });
      await renamed.git('mv', 'old.txt', 'new.txt');
      await renamed.commit('rename', {
        'other.txt': 'two\n',
        'large.txt': numberedLines('large'),
      });
      [hash] = await renamed.resolve('HEAD');
    });

    test('shows the diff of one file the commit changed, following a rename', async () => {
      await withView(log, [renamed.root], async (view) => {
        await view.connection.receive({
          type: 'selectCommit',
          root: renamed.root,
          hash,
        });
        await view.connection.receive({
          type: 'selectFile',
          root: renamed.root,
          hash,
          path: 'new.txt',
        });
        const diff = view.page.last('diff');
        assert.strictEqual(diff?.path, 'new.txt');
        assert.ok(diff.patch.includes('rename from old.txt'), diff.patch);
        assert.ok(!diff.patch.includes('other.txt'), diff.patch);
        await view.connection.receive({
          type: 'loadFileDiff',
          root: renamed.root,
          hash,
          path: 'new.txt',
          diff: 1,
        });
        assert.ok(
          view.page.last('fileDiff')?.patch.includes('rename from old.txt'),
        );
      });
    });

    test('keeps a rename in a commit diff that leaves a large file out', async () => {
      await withView(log, [renamed.root], async (view) => {
        await view.connection.receive({
          type: 'selectCommit',
          root: renamed.root,
          hash,
        });
        const patch = view.page.last('diff')?.patch ?? '';
        assert.ok(patch.includes('rename from old.txt'), patch);
        assert.ok(!patch.includes('large.txt'), patch);
      });
    });
  });

  suite('with a file no commit changed since', () => {
    let files: TempRepository;
    let kept: string;
    let changed: string;

    beforeAll(async () => {
      files = await tempRepository(path.join(folder, 'files'));
      await files.commit('kept', { 'kept.txt': 'kept\n' });
      await files.commit('changed', { 'changed.txt': 'changed\n' });
      [kept, changed] = await files.resolve('HEAD~1', 'HEAD');
    });

    test('shows a file the commit did not change whole, until another commit is selected', async () => {
      await withView(log, [files.root], async (view) => {
        await view.connection.receive({
          type: 'selectCommit',
          root: files.root,
          hash: changed,
        });
        await view.connection.receive({
          type: 'selectFile',
          root: files.root,
          hash: changed,
          path: 'kept.txt',
        });
        const content = view.page.last('fileContent');
        assert.strictEqual(content?.path, 'kept.txt');
        assert.strictEqual(content.content, 'kept\n');
        assert.strictEqual(content.binary, false);

        await view.connection.receive({
          type: 'selectCommit',
          root: files.root,
          hash: kept,
        });
        view.page.clear();
        await view.connection.receive({ type: 'ready' });
        const shown = view.page.messages.findLast(
          (message) =>
            message.type === 'diff' || message.type === 'fileContent',
        );
        assert.strictEqual(shown?.type, 'diff');
        assert.strictEqual(shown.hash, kept);
      });
    });

    test('sends no unchanged Files tree or whole file on a refresh', async () => {
      const draft = path.join(files.root, 'draft.txt');
      const added = path.join(files.root, 'new.txt');
      fs.writeFileSync(draft, 'draft\n');
      try {
        await withView(log, [files.root], async (view) => {
          await view.connection.receive({
            type: 'selectCommit',
            root: files.root,
            hash: workingTreeHash,
          });
          await view.connection.receive({
            type: 'loadTree',
            root: files.root,
            hash: workingTreeHash,
          });
          await view.connection.receive({
            type: 'selectFile',
            root: files.root,
            hash: workingTreeHash,
            path: 'kept.txt',
            area: 'unstaged',
          });
          assert.strictEqual(view.page.last('fileContent')?.content, 'kept\n');
          view.page.clear();
          await view.connection.refresh();
          assert.ok(view.page.last('workingTree'));
          assert.strictEqual(view.page.last('tree'), undefined);
          assert.strictEqual(view.page.last('fileContent'), undefined);

          fs.writeFileSync(added, 'new\n');
          await view.connection.refresh();
          assert.ok(view.page.last('tree')?.paths.includes('new.txt'));
        });
      } finally {
        fs.rmSync(draft, { force: true });
        fs.rmSync(added, { force: true });
      }
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

    test('shows a binary file whole again once it changes, staged in full', async () => {
      const file = path.join(images.root, 'pixel.png');
      try {
        await withView(log, [images.root], async (view) => {
          await view.connection.receive({
            type: 'selectCommit',
            root: images.root,
            hash: workingTreeHash,
          });
          await view.connection.receive({
            type: 'selectFile',
            root: images.root,
            hash: workingTreeHash,
            path: 'pixel.png',
            area: 'unstaged',
          });
          const shown = view.page.last('fileContent');
          assert.strictEqual(shown?.binary, true);
          assert.ok(shown.id);

          view.page.clear();
          fs.writeFileSync(file, Buffer.concat([pixel, pixel]));
          await images.git('add', 'pixel.png');
          await view.connection.refresh();
          const changed = view.page.last('fileContent');
          assert.ok(changed?.id);
          assert.notStrictEqual(changed.id, shown.id);
        });
      } finally {
        await images.git('reset', '--hard');
      }
    });
  });
});

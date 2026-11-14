import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterAll, beforeAll, suite, test } from 'vitest';
import {
  collapseThreshold,
  patchByteBudget,
  patchLineBudget,
  workingTreeHash,
} from '../../../../../tools/git/shared/protocol';
import { maxFileSize } from '../../../../../tools/git/main/files';
import { waitFor } from '../../../../helpers/fixtures';
import {
  removeFolder,
  tempFolder,
  tempRepository,
  type TempRepository,
} from '../../../../helpers/repositories';
import { recordingLog } from '../../../../helpers/stub';
import {
  closeViews,
  failOnErrorsLogged,
  gate,
  numberedLines,
  stubMethod,
  withView,
} from '../../../../helpers/harness';
import { fortyLines } from '../../../../helpers/gitFixtures';

const longLines = (text: string) =>
  `${text} ${'x'.repeat(1024)}\n`.repeat(maxFileSize / 1024 + 1);

suite('Git tool showing diffs', () => {
  let folder: string;
  let long: TempRepository;
  let spaced: TempRepository;

  const { log, error: logged } = recordingLog();
  failOnErrorsLogged(logged);

  beforeAll(async () => {
    folder = tempFolder('diffs');
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

  suite('with a commit adding a large file and a small one', () => {
    let large: TempRepository;
    let hash: string;

    beforeAll(async () => {
      large = await tempRepository(path.join(folder, 'large'));
      await large.commit('large', {
        'large.txt': numberedLines('line'),
        'small.txt': 'small\n',
      });
      [hash] = await large.resolve('HEAD');
    });

    test('reads a commit diff while reading its files, only once, also when it leaves a file out', async () => {
      await withView(log, [large.root], async (view) => {
        const held = gate();
        stubMethod(view.view, 'commitFiles', async (original, ...args) => {
          await held.opened;
          return original(...args);
        });
        let patches = 0;
        for (const name of ['patchOf', 'budgetedPatch']) {
          stubMethod(view.view, name, (original, ...args) => {
            patches += 1;
            return original(...args);
          });
        }
        const selected = view.connection.receive({
          type: 'selectCommit',
          root: large.root,
          hash,
        });
        await waitFor(() => patches > 0, 'the diff to be read');
        held.open();
        await selected;
        assert.ok(view.page.last('diff')?.patch.includes('b/small.txt'));
        assert.strictEqual(patches, 1);
      });
    });

    test('leaves large files out of a commit diff until one is asked for', async () => {
      await withView(log, [large.root], async (view) => {
        await view.connection.receive({
          type: 'selectCommit',
          root: large.root,
          hash,
        });
        const diff = view.page.last('diff');
        const patch = diff?.patch ?? '';
        assert.ok(patch.includes('b/small.txt'), patch);
        assert.ok(!patch.includes('large.txt'), patch);
        assert.deepStrictEqual(diff?.leftOut, [
          { path: 'large.txt', lines: collapseThreshold + 1 },
        ]);
        await view.connection.receive({
          type: 'loadFileDiff',
          root: large.root,
          hash,
          path: 'large.txt',
          diff: 1,
        });
        const fileDiff = view.page.last('fileDiff');
        assert.strictEqual(fileDiff?.path, 'large.txt');
        assert.ok(fileDiff?.patch.includes(`+line ${collapseThreshold}`));
        assert.strictEqual(fileDiff.diff, 1);
      });
    });

    test('leaves a selected large file of a commit out of its diff until it is asked for', async () => {
      await withView(log, [large.root], async (view) => {
        await view.connection.receive({
          type: 'selectCommit',
          root: large.root,
          hash,
        });
        await view.connection.receive({
          type: 'selectFile',
          root: large.root,
          hash,
          path: 'large.txt',
        });
        const diff = view.page.last('diff');
        assert.strictEqual(diff?.path, 'large.txt');
        assert.strictEqual(diff.patch, '');
        assert.deepStrictEqual(diff.leftOut, [
          { path: 'large.txt', lines: collapseThreshold + 1 },
        ]);
        await view.connection.receive({
          type: 'loadFileDiff',
          root: large.root,
          hash,
          path: 'large.txt',
          diff: 2,
        });
        assert.ok(
          view.page
            .last('fileDiff')
            ?.patch.includes(`+line ${collapseThreshold}`),
        );
      });
    });
  });

  test('sends an opened file left out of the uncommitted diff again once it changed on disk', async () => {
    const large = await tempRepository(path.join(folder, 'large-edited'));
    await large.commit('large', {
      'large.txt': numberedLines('line'),
      'small.txt': 'small\n',
    });
    const file = path.join(large.root, 'large.txt');
    fs.writeFileSync(file, numberedLines('first'));
    fs.writeFileSync(path.join(large.root, 'small.txt'), 'changed\n');
    await withView(log, [large.root], async (view) => {
      await view.connection.receive({
        type: 'selectCommit',
        root: large.root,
        hash: workingTreeHash,
      });
      await view.connection.receive({
        type: 'loadFileDiff',
        root: large.root,
        hash: workingTreeHash,
        path: 'large.txt',
        diff: 1,
      });
      assert.ok(
        view.page
          .last('fileDiff')
          ?.patch.includes(`+first ${collapseThreshold}`),
      );
      view.page.clear();
      await view.connection.refresh();
      assert.strictEqual(view.page.last('fileDiff'), undefined);
      fs.writeFileSync(file, numberedLines('second'));
      await view.connection.refresh();
      assert.strictEqual(view.page.last('diff'), undefined);
      const fileDiff = view.page.last('fileDiff');
      assert.strictEqual(fileDiff?.diff, 1);
      assert.ok(fileDiff.patch.includes(`+second ${collapseThreshold}`));
    });
  });

  test('shows a file of a commit too large to send entire once it is asked for, when only a line of it changed', async () => {
    const huge = await tempRepository(path.join(folder, 'huge-entire'));
    const lines = Array.from(
      { length: patchByteBudget / 1024 + 1 },
      (_, index) => `line ${index} ${'x'.repeat(1024)}\n`,
    );
    await huge.commit('first', { 'huge.txt': lines.join('') });
    lines[7] = 'changed\n';
    await huge.commit('second', { 'huge.txt': lines.join('') });
    const [hash] = await huge.resolve('HEAD');
    await withView(log, [huge.root], async (view) => {
      await view.connection.receive({ type: 'setShowEntireFile', show: true });
      await view.connection.receive({
        type: 'selectCommit',
        root: huge.root,
        hash,
      });
      await view.connection.receive({
        type: 'selectFile',
        root: huge.root,
        hash,
        path: 'huge.txt',
      });
      assert.deepStrictEqual(view.page.last('diff')?.leftOut, [
        { path: 'huge.txt', lines: undefined },
      ]);
      await view.connection.receive({
        type: 'loadFileDiff',
        root: huge.root,
        hash,
        path: 'huge.txt',
        diff: 2,
      });
      const patch = view.page.last('fileDiff')?.patch ?? '';
      assert.match(patch, /^\+changed$/m);
      assert.ok(patch.includes(` ${lines.at(-1)}`));
    });
  });

  test('reads a selected untracked file too large to count only once it is asked for, and again once it changed on disk', async () => {
    const large = await tempRepository(path.join(folder, 'large-untracked'));
    await large.commit('first', { 'small.txt': 'small\n' });
    const file = path.join(large.root, 'big.log');
    fs.writeFileSync(file, longLines('first'));
    await withView(log, [large.root], async (view) => {
      let reads = 0;
      stubMethod(view.view, 'patchOf', (original, ...args) => {
        reads += 1;
        return original(...args);
      });
      await view.connection.receive({
        type: 'selectCommit',
        root: large.root,
        hash: workingTreeHash,
      });
      reads = 0;
      await view.connection.receive({
        type: 'selectFile',
        root: large.root,
        hash: workingTreeHash,
        path: 'big.log',
      });
      const diff = view.page.last('diff');
      assert.strictEqual(diff?.path, 'big.log');
      assert.strictEqual(diff.patch, '');
      assert.deepStrictEqual(diff.leftOut, [
        { path: 'big.log', lines: undefined },
      ]);
      await view.connection.refresh();
      assert.strictEqual(reads, 0);
      await view.connection.receive({
        type: 'loadFileDiff',
        root: large.root,
        hash: workingTreeHash,
        path: 'big.log',
        diff: 2,
      });
      assert.ok(view.page.last('fileDiff')?.patch.includes('+first x'));
      view.page.clear();
      fs.writeFileSync(file, longLines('second'));
      await view.connection.refresh();
      assert.strictEqual(view.page.last('diff'), undefined);
      assert.ok(view.page.last('fileDiff')?.patch.includes('+second x'));
    });
  });

  test('leaves out a selected untracked file too large to count past the first 50 too, rather than sending its whole patch, while diffing a small one there', async () => {
    const crowded = await tempRepository(path.join(folder, 'crowded'));
    await crowded.commit('first', { 'small.txt': 'small\n' });
    for (let index = 0; index < 50; index++) {
      fs.writeFileSync(
        path.join(crowded.root, `a${String(index).padStart(2, '0')}.txt`),
        `${index}\n`,
      );
    }
    fs.writeFileSync(path.join(crowded.root, 'zz-big.log'), longLines('big'));
    fs.writeFileSync(path.join(crowded.root, 'zz-small.txt'), 'little\n');
    await withView(log, [crowded.root], async (view) => {
      await view.connection.receive({
        type: 'selectCommit',
        root: crowded.root,
        hash: workingTreeHash,
      });
      const select = async (file: string) => {
        await view.connection.receive({
          type: 'selectFile',
          root: crowded.root,
          hash: workingTreeHash,
          path: file,
        });
        return view.page.last('diff');
      };
      const big = await select('zz-big.log');
      assert.strictEqual(big?.patch, '');
      assert.deepStrictEqual(big.leftOut, [
        { path: 'zz-big.log', lines: undefined },
      ]);
      const small = await select('zz-small.txt');
      assert.ok(small?.patch.includes('+little'), small?.patch);
      assert.strictEqual(small?.leftOut, undefined);
    });
  });

  test('leaves the files past the budget out of a commit diff', async () => {
    const many = await tempRepository(path.join(folder, 'many'));
    const lines = Math.min(collapseThreshold, Math.ceil(patchLineBudget / 2));
    const files = Math.floor(patchLineBudget / lines) + 1;
    const text = 'line\n'.repeat(lines);
    await many.commit(
      'many',
      Object.fromEntries(
        Array.from({ length: files }, (_, index) => [
          `${String(index).padStart(2, '0')}.txt`,
          text,
        ]),
      ),
    );
    const [hash] = await many.resolve('HEAD');
    await withView(log, [many.root], async (view) => {
      await view.connection.receive({
        type: 'selectCommit',
        root: many.root,
        hash,
      });
      assert.strictEqual(view.page.last('files')?.files.length, files);
      const patch = view.page.last('diff')?.patch ?? '';
      const last = `${String(files - 1).padStart(2, '0')}.txt`;
      assert.ok(patch.includes('b/00.txt'), patch.slice(0, 200));
      assert.ok(!patch.includes(last), last);
    });
  });
});

import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  suite,
  test,
} from 'vitest';
import { workingTreeHash } from '../../../../../tools/git/shared/protocol';
import type { GitTool } from '../../../../../tools/git/main/tool';
import {
  tempRepository,
  type TempRepository,
} from '../../../../helpers/repositories';
import { recordingLog, failOnErrorsLogged } from '../../../../helpers/stub';
import {
  type Connection,
  closeViews,
  openView,
  stubMethod,
  withView,
} from '../../../../helpers/harness';
import {
  viewRepositories,
  type ViewRepositories,
  numberedLines,
} from '../../../../helpers/gitFixtures';
import { FakePage } from '../../../../helpers/fakePage';
import { removeFolder, tempFolder } from '../../../../helpers/tempFolders';

suite('Git tool showing diffs', () => {
  let folder: string;
  let viewFolder: string;
  let repository: TempRepository;
  let fixture: ViewRepositories['fixture'];

  const { log, error: logged } = recordingLog();
  failOnErrorsLogged(logged);

  beforeAll(async () => {
    folder = tempFolder('diffs');
    ({ folder: viewFolder, repository, fixture } = await viewRepositories());
  });

  afterAll(async () => {
    await closeViews();
    removeFolder(folder);
    removeFolder(viewFolder);
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

  suite('with a repository with a merge open in a tab', () => {
    let fastforward: GitTool;
    let page: FakePage;
    let connection: Connection;

    beforeEach(async () => {
      ({
        view: fastforward,
        page,
        connection,
      } = await openView(log, [repository.root]));
    });

    afterEach(() => connection.dispose());

    test('lists every file of a commit and of the working tree', async () => {
      const file = path.join(repository.root, 'tree-file.txt');
      fs.writeFileSync(file, 'tree\n');
      try {
        await connection.receive({
          type: 'selectCommit',
          root: repository.root,
          hash: workingTreeHash,
        });
        await connection.receive({
          type: 'loadTree',
          root: repository.root,
          hash: workingTreeHash,
        });
        assert.ok(page.last('tree')?.paths.includes('tree-file.txt'));
        await connection.receive({
          type: 'selectCommit',
          root: repository.root,
          hash: fixture.merge,
        });
        await connection.receive({
          type: 'loadTree',
          root: repository.root,
          hash: fixture.merge,
        });
        const tree = page.last('tree');
        assert.strictEqual(tree?.hash, fixture.merge);
        assert.ok(!tree.paths.includes('tree-file.txt'));
      } finally {
        fs.rmSync(file);
      }
    });

    test('lists the untracked files of the working tree once per refresh, for its files and its tree', async () => {
      await connection.receive({
        type: 'selectCommit',
        root: repository.root,
        hash: workingTreeHash,
      });
      await connection.receive({
        type: 'loadTree',
        root: repository.root,
        hash: workingTreeHash,
      });
      stubMethod(fastforward, 'sendWorkingTree', async (original, ...args) => {
        const workingTree = await original(...args);
        assert.ok(
          typeof workingTree === 'object' &&
            workingTree !== null &&
            'files' in workingTree &&
            Array.isArray(workingTree.files) &&
            'untracked' in workingTree &&
            Array.isArray(workingTree.untracked),
        );
        return {
          ...workingTree,
          untracked: [...workingTree.untracked, 'listed.txt'],
          files: [
            ...workingTree.files,
            {
              path: 'listed.txt',
              oldPath: undefined,
              status: 'U',
              insertions: 0,
              deletions: 0,
            },
          ],
        };
      });
      await connection.refresh();
      assert.deepStrictEqual(page.last('tree')?.paths, ['listed.txt']);
    });

    test('sends no tree of a commit no longer selected', async () => {
      await connection.receive({
        type: 'selectCommit',
        root: repository.root,
        hash: fixture.b,
      });
      page.clear();
      await connection.receive({
        type: 'loadTree',
        root: repository.root,
        hash: fixture.a,
      });
      assert.strictEqual(page.last('tree'), undefined);
      await connection.receive({
        type: 'loadTree',
        root: repository.root,
        hash: fixture.b,
      });
      assert.strictEqual(page.last('tree')?.hash, fixture.b);
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

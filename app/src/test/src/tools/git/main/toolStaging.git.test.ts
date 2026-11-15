import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterAll, beforeAll, beforeEach, suite, test } from 'vitest';
import { workingTreeHash } from '../../../../../tools/git/shared/protocol';
import {
  tempRepository,
  type TempRepository,
} from '../../../../helpers/repositories';
import { recordingLog, failOnErrorsLogged } from '../../../../helpers/stub';
import { closeViews, withView } from '../../../../helpers/harness';
import { removeFolder, tempFolder } from '../../../../helpers/tempFolders';

suite('Git tool staged and unstaged changes', () => {
  const { log, error: logged } = recordingLog();
  failOnErrorsLogged(logged);
  let folder: string;
  let repository: TempRepository;

  beforeAll(async () => {
    folder = tempFolder('staging');
    repository = await tempRepository(path.join(folder, 'app'));
    await repository.commit('a', { 'both.txt': 'one\n' });
  });

  beforeEach(async () => {
    fs.writeFileSync(path.join(repository.root, 'both.txt'), 'two\n');
    await repository.git('add', 'both.txt');
    fs.writeFileSync(path.join(repository.root, 'both.txt'), 'three\n');
  });

  afterAll(async () => {
    await closeViews();
    removeFolder(folder);
  });

  test('shows all the changes since HEAD first, and the staged and unstaged ones apart, each side read from where it is kept', async () => {
    await withView(log, [repository.root], async (view) => {
      const root = repository.root;
      assert.strictEqual(view.page.last('workingTree')?.files, 1);
      await view.connection.receive({
        type: 'selectCommit',
        root,
        hash: workingTreeHash,
      });
      const files = view.page.last('files');
      assert.deepStrictEqual(
        [
          files?.all?.map((file) => file.path),
          files?.staged?.map((file) => file.path),
          files?.files.map((file) => file.path),
        ],
        [['both.txt'], ['both.txt'], ['both.txt']],
      );
      const all = view.page.last('diff');
      assert.ok(all);
      assert.strictEqual(all.area, undefined);
      assert.match(all.patch, /^-one$/m);
      assert.match(all.patch, /^\+three$/m);
      await view.connection.receive({
        type: 'selectFile',
        root,
        hash: workingTreeHash,
        path: undefined,
        area: 'staged',
      });
      const staged = view.page.last('diff');
      assert.strictEqual(staged?.area, 'staged');
      assert.match(staged.patch, /^\+two$/m);
      await view.connection.receive({
        type: 'selectFile',
        root,
        hash: workingTreeHash,
        path: 'both.txt',
        area: 'staged',
      });
      const blob = /^index [0-9a-f]+\.\.([0-9a-f]+)/m.exec(
        view.page.last('diff')?.patch ?? '',
      )?.[1];
      assert.ok(blob);
      await view.connection.receive({
        type: 'loadTexts',
        root,
        hash: workingTreeHash,
        diff: 0,
        texts: [{ path: 'both.txt', side: 'new', blob }],
      });
      assert.strictEqual(view.page.last('texts')?.texts[0]?.text, 'two\n');
      await view.connection.receive({
        type: 'selectFile',
        root,
        hash: workingTreeHash,
        path: 'both.txt',
        area: 'unstaged',
      });
      const unstaged = view.page.last('diff');
      assert.deepStrictEqual(
        [unstaged?.path, unstaged?.area],
        ['both.txt', 'unstaged'],
      );
      assert.match(unstaged?.patch ?? '', /^-two$/m);
      assert.match(unstaged?.patch ?? '', /^\+three$/m);
      await view.connection.receive({
        type: 'selectFile',
        root,
        hash: workingTreeHash,
        path: undefined,
      });
      const again = view.page.last('diff');
      assert.ok(again);
      assert.strictEqual(again.area, undefined);
      assert.doesNotMatch(again.patch, /two/);
      assert.match(again.patch, /^\+three$/m);
    });
  });

  test('starts with all the changes while nothing is staged too', async () => {
    await repository.git('restore', '--staged', 'both.txt');
    await withView(log, [repository.root], async (view) => {
      await view.connection.receive({
        type: 'selectCommit',
        root: repository.root,
        hash: workingTreeHash,
      });
      assert.deepStrictEqual(view.page.last('files')?.staged, []);
      const diff = view.page.last('diff');
      assert.ok(diff);
      assert.strictEqual(diff.area, undefined);
      assert.match(diff.patch, /^\+three$/m);
    });
  });
});

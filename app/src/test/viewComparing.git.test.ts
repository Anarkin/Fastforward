import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { workingTreeHash } from '../shared/protocol';
import { comparisonOf } from '../shared/comparisons';
import type { Connection } from '../view';
import { waitFor } from './fixtures';
import {
  removeFolder,
  tempFolder,
  tempRepository,
  type TempRepository,
} from './repositories';
import { recordingLog } from './stub';
import {
  closeViews,
  failOnErrorsLogged,
  type FakePage,
  openView,
} from './viewHarness';

suite('View comparing', function () {
  this.timeout(30_000);

  let repository: TempRepository;
  let page: FakePage;
  let connection: Connection;
  let root: string;
  let feature: string;
  let main: string;

  const { log, error: logged } = recordingLog();
  failOnErrorsLogged(logged);

  suiteSetup(async () => {
    repository = await tempRepository(tempFolder('view-compare'));
    await repository.commit('root', { 'shared.txt': 'one\ntwo\n' });
    await repository.git('checkout', '-b', 'feature');
    await repository.commit('feature', { 'shared.txt': 'one\nfeature\n' });
    await repository.git('checkout', 'main');
    await repository.commit('main', { 'main.txt': 'main only\n' });
    [root, feature, main] = await repository.resolve(
      'main~1',
      'feature',
      'main',
    );
  });

  suiteTeardown(async () => {
    await closeViews();
    removeFolder(repository.root);
  });

  setup(async () => {
    ({ page, connection } = await openView(log, [repository.root]));
  });

  teardown(() => connection.dispose());

  const select = (hash: string) =>
    connection.receive({ type: 'selectCommit', root: repository.root, hash });

  // A refresh, such as the watcher's for a file a test wrote, can take over
  // loading the diff of a selection, sending it after the selection is handled
  const diffOf = async (hash: string) => {
    await waitFor(() => page.last('diff')?.hash === hash, 'the diff');
    return page.last('diff')?.patch ?? '';
  };

  test('diffs two commits on different branches, from the one selected first', async () => {
    const hash = comparisonOf(main, feature);
    await select(hash);
    assert.deepStrictEqual(
      page.last('files')?.files.map((file) => [file.status, file.path]),
      [
        ['D', 'main.txt'],
        ['M', 'shared.txt'],
      ],
    );
    assert.strictEqual(page.last('files')?.hash, hash);
    const diff = page.last('diff');
    assert.strictEqual(diff?.hash, hash);
    assert.match(diff.patch, /^-main only$/m);
    assert.match(diff.patch, /^\+feature$/m);

    await connection.receive({
      type: 'selectFile',
      root: repository.root,
      hash,
      path: 'shared.txt',
    });
    assert.strictEqual(page.last('diff')?.path, 'shared.txt');
    assert.doesNotMatch(page.last('diff')?.patch ?? '', /main only/);
    assert.strictEqual(page.last('error'), undefined);
  });

  test('shows a file left unchanged as it is in the commit compared to', async () => {
    await select(comparisonOf(root, main));
    await connection.receive({
      type: 'selectFile',
      root: repository.root,
      hash: comparisonOf(root, main),
      path: 'shared.txt',
    });
    assert.strictEqual(page.last('fileContent')?.content, 'one\ntwo\n');
    await connection.receive({
      type: 'loadTree',
      root: repository.root,
      hash: comparisonOf(root, main),
    });
    assert.deepStrictEqual(page.last('tree')?.paths, [
      'main.txt',
      'shared.txt',
    ]);
  });

  test('diffs a commit and the working tree either way, reading the uncommitted side from disk', async () => {
    const file = path.join(repository.root, 'shared.txt');
    fs.writeFileSync(file, 'one\ndisk\n');
    try {
      const forward = comparisonOf(root, workingTreeHash);
      await select(forward);
      assert.deepStrictEqual(
        page.last('files')?.files.map((change) => [change.status, change.path]),
        [
          ['A', 'main.txt'],
          ['M', 'shared.txt'],
        ],
      );
      assert.match(await diffOf(forward), /^\+disk$/m);

      const backward = comparisonOf(workingTreeHash, main);
      await select(backward);
      assert.deepStrictEqual(
        page.last('files')?.files.map((change) => [change.status, change.path]),
        [['M', 'shared.txt']],
      );
      const patch = await diffOf(backward);
      assert.match(patch, /^-disk$/m);
      assert.match(patch, /^\+two$/m);
      const [blob] = await repository.resolve('main:shared.txt');
      await connection.receive({
        type: 'loadTexts',
        root: repository.root,
        hash: backward,
        diff: 1,
        texts: [
          { path: 'shared.txt', side: 'old', blob: '1'.repeat(40) },
          { path: 'shared.txt', side: 'new', blob },
        ],
      });
      assert.deepStrictEqual(
        page.last('texts')?.texts.map(({ side, text }) => [side, text]),
        [
          ['old', 'one\ndisk\n'],
          ['new', 'one\ntwo\n'],
        ],
      );
    } finally {
      await repository.git('checkout', '--', 'shared.txt');
    }
  });

  test('updates a comparison with the working tree as files change', async () => {
    const draft = path.join(repository.root, 'draft.txt');
    await select(comparisonOf(main, workingTreeHash));
    assert.deepStrictEqual(page.last('files')?.files, []);
    fs.writeFileSync(draft, 'draft\n');
    try {
      await connection.refresh();
      assert.deepStrictEqual(
        page.last('files')?.files.map((change) => change.path),
        ['draft.txt'],
      );
      assert.match(page.last('diff')?.patch ?? '', /^\+draft$/m);
    } finally {
      fs.rmSync(draft, { force: true });
    }
  });

  test('goes back to a comparison, revealing the commit compared to', async () => {
    const hash = comparisonOf(root, feature);
    await select(main);
    await select(hash);
    await select(root);
    assert.deepStrictEqual(
      page.last('navigation')?.back.map((entry) => entry.hash),
      [hash, main],
    );
    await connection.receive({
      type: 'navigate',
      root: repository.root,
      direction: 'back',
      steps: 1,
    });
    const reveal = page.last('reveal');
    assert.strictEqual(reveal?.hash, hash);
    assert.strictEqual(
      reveal.index,
      page
        .last('commits')
        ?.commits.findIndex((commit) => commit.hash === feature),
    );
    assert.strictEqual(page.last('files')?.hash, hash);
    assert.strictEqual(page.last('error'), undefined);
  });

  test('says a comparison with a commit missing from the history is not in it', async () => {
    const hash = comparisonOf(main, '1'.repeat(40));
    await select(hash);
    assert.strictEqual(page.last('files'), undefined);
    assert.match(page.last('error')?.message ?? '', /is not in the history/);
  });
});

import * as assert from 'node:assert';
import * as path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { afterAll, afterEach, beforeAll, suite, test } from 'vitest';
import type { RefInfo } from '../../../../../tools/git/shared/protocol';
import { remoteTagsKey } from '../../../../../tools/git/main/storage';
import type { Connection } from '../../../../harness';
import { waitFor } from '../../../../fixtures';
import {
  removeFolder,
  tempFolder,
  tempRepository,
  type TempRepository,
} from '../../../../repositories';
import { recordingLog } from '../../../../stub';
import {
  closeViews,
  deleteTags,
  failOnErrorsLogged,
  type FakePage,
  openView,
  takeErrorsLogged,
  gitState,
} from '../../../../harness';

function remoteTag(name: string, tag: string, commit: string): RefInfo {
  return { kind: 'remote-tag', name: `${name}/${tag}`, commit, remote: name };
}

suite('Git tool remote tags', () => {
  let folder: string;
  let repository: TempRepository;
  let remote: TempRepository;
  let page: FakePage;
  let connection: Connection;
  let a: string;
  let b: string;

  const { log, error: logged } = recordingLog();
  failOnErrorsLogged(logged);

  beforeAll(async () => {
    folder = tempFolder('remote-tags-view');
    remote = await tempRepository(path.join(folder, 'remote'), {
      bare: true,
    });
    repository = await tempRepository(path.join(folder, 'local'));
    await repository.commit('a');
    await repository.commit('b');
    [a, b] = await repository.resolve('main~1', 'main');
    await repository.git('remote', 'add', 'origin', remote.root);
    await repository.git('push', '-u', 'origin', 'main');
    ({ page, connection } = await openView(log, [repository.root]));
  });

  afterEach(async () => {
    await deleteTags(repository);
    await deleteTags(remote);
    await repository
      .git('config', '--unset-all', 'remote.origin.tagOpt')
      .catch(() => '');
  });

  afterAll(async () => {
    await closeViews();
    removeFolder(folder);
  });

  const remoteTags = (): RefInfo[] =>
    (page.last('repository')?.refs ?? []).filter(
      (ref) => ref.kind === 'remote-tag',
    );

  const fetchedShows = async (expected: RefInfo[]): Promise<void> => {
    await connection.receive({ type: 'fetch', root: repository.root });
    await waitFor(
      () => isDeepStrictEqual(remoteTags(), expected),
      `the remote tags ${JSON.stringify(expected)}, not ${JSON.stringify(remoteTags())}`,
    );
  };

  test('shows the tags of a remote next to the local ones after a fetch, on the commits they point at, comparing an annotated one by its commit', async () => {
    await repository.git('tag', 'light', a);
    await repository.git('tag', '-a', 'annotated', '-m', 'release', b);
    await repository.git('push', 'origin', 'light', 'annotated');
    await repository.git('tag', 'unpushed', a);
    await fetchedShows([
      remoteTag('origin', 'annotated', b),
      remoteTag('origin', 'light', a),
    ]);
  });

  test('shows a tag the remote moved on the commit it points at there, apart from the local one', async () => {
    await repository.git('tag', 'moved', a);
    await repository.git('push', 'origin', 'moved');
    await remote.git('tag', '-f', 'moved', b);
    await fetchedShows([remoteTag('origin', 'moved', b)]);
    assert.deepStrictEqual(await repository.resolve('moved'), [a]);
  });

  test('shows a tag only on the remote, on a commit here, as when fetches leave tags out', async () => {
    await repository.git('config', 'remote.origin.tagOpt', '--no-tags');
    await remote.git('tag', 'theirs', a);
    await fetchedShows([remoteTag('origin', 'theirs', a)]);
    assert.strictEqual(
      (await repository.git('tag', '--list', 'theirs')).trim(),
      '',
    );
  });

  test('writes no ref for the tags of a remote, keeping them itself, as git keeps no remote-tracking refs for tags and other tools would show refs it wrote', async () => {
    await repository.git('config', 'remote.origin.tagOpt', '--no-tags');
    await remote.git('tag', 'listed', a);
    const refs = () => repository.git('for-each-ref', '--format=%(refname)');
    const before = await refs();
    await fetchedShows([remoteTag('origin', 'listed', a)]);
    assert.strictEqual(await refs(), before);
  });

  test('shows the tags of each remote apart, under its name', async () => {
    const second = await tempRepository(path.join(folder, 'second'), {
      bare: true,
    });
    await repository.git('remote', 'add', 'second', second.root);
    try {
      await repository.git('tag', 'shared', a);
      await repository.git('push', 'origin', 'shared');
      await repository.git('push', 'second', 'main', 'shared');
      await fetchedShows([
        remoteTag('origin', 'shared', a),
        remoteTag('second', 'shared', a),
      ]);
    } finally {
      await repository.git('remote', 'remove', 'second');
    }
  });

  test("shows the tags of the remotes that fetched when another can't be fetched", async () => {
    await repository.git('remote', 'add', 'gone', path.join(folder, 'gone'));
    try {
      await repository.git('tag', 'beside-gone', a);
      await repository.git('push', 'origin', 'beside-gone');
      await fetchedShows([remoteTag('origin', 'beside-gone', a)]);
      takeErrorsLogged(
        logged,
        /^Fetching every remote failed$/,
        /^git -c remote\.origin\.prune=true -c remote\.origin\.pruneTags=false -c remote\.gone\.prune=true -c remote\.gone\.pruneTags=false fetch --progress --all --porcelain failed: .*could not fetch gone/s,
      );
    } finally {
      await repository.git('remote', 'remove', 'gone');
    }
  });

  test('drops the tags of a remote once it is removed', async () => {
    const gone = await tempRepository(path.join(folder, 'gone'), {
      bare: true,
    });
    await repository.git('remote', 'add', 'gone', gone.root);
    await repository.git('tag', 'kept', a);
    await repository.git('push', 'gone', 'main', 'kept');
    await fetchedShows([remoteTag('gone', 'kept', a)]);
    await repository.git('remote', 'remove', 'gone');
    await connection.refresh();
    assert.deepStrictEqual(remoteTags(), []);
  });

  test('shows the remote tags listed before the app last quit, without fetching', async () => {
    const opened = await openView(log, [repository.root], false);
    await gitState(opened.store).update(remoteTagsKey, {
      [repository.root]: { origin: { saved: a } },
    });
    try {
      await opened.connection.receive({ type: 'ready' });
      assert.deepStrictEqual(
        opened.page
          .last('repository')
          ?.refs.filter((ref) => ref.kind === 'remote-tag'),
        [remoteTag('origin', 'saved', a)],
      );
    } finally {
      opened.connection.dispose();
    }
  });

  test('reads the history as ever when a remote tag points at a commit missing here, as it starts no walk of the history', async () => {
    const missing = 'f'.repeat(40);
    const opened = await openView(log, [repository.root], false);
    await gitState(opened.store).update(remoteTagsKey, {
      [repository.root]: { origin: { elsewhere: missing } },
    });
    try {
      await opened.connection.receive({ type: 'ready' });
      assert.strictEqual(
        opened.page.last('commits')?.total,
        page.last('commits')?.total,
      );
      assert.ok(
        opened.page
          .last('repository')
          ?.refs.some((ref) => ref.name === 'origin/elsewhere'),
      );
    } finally {
      opened.connection.dispose();
    }
  });
});

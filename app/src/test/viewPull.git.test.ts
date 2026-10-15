import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { afterAll, afterEach, beforeAll, suite, test } from 'vitest';
import type { ToWebview } from '../shared/protocol';
import type { Connection } from '../view';
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
  takeErrorsLogged,
  withNotices,
} from './viewHarness';

function runningState(message: ToWebview): string[] {
  return message.type === 'pulling' || message.type === 'fetching'
    ? [`${message.type} ${message.running}`]
    : [];
}

suite('View pulling', () => {
  let folder: string;
  let repository: TempRepository;
  let other: TempRepository;
  let remote: TempRepository;
  let page: FakePage;
  let connection: Connection;

  const { log, error: logged } = recordingLog();
  failOnErrorsLogged(logged);

  beforeAll(async () => {
    folder = tempFolder('pull');
    remote = await tempRepository(path.join(folder, 'remote'), {
      bare: true,
    });
    repository = await tempRepository(path.join(folder, 'local'));
    await repository.commit('a', { shared: 'a' });
    await repository.git('remote', 'add', 'origin', remote.root);
    await repository.git('push', '-u', 'origin', 'main');
    other = await tempRepository(path.join(folder, 'other'));
    await other.git('remote', 'add', 'origin', remote.root);
    await other.git('fetch', 'origin');
    await other.git('reset', '--hard', 'origin/main');
    ({ page, connection } = await openView(
      log,
      [repository.root],
      'unwatched',
    ));
  });

  afterEach(async () => {
    await repository.git('checkout', '-f', 'main');
    await repository.git('clean', '-fdq');
    await repository.git('fetch', 'origin');
    await repository.git('reset', '--hard', 'origin/main');
    await other.git('fetch', 'origin');
    await other.git('reset', '--hard', 'origin/main');
    await connection.refresh();
  });

  afterAll(async () => {
    await closeViews();
    removeFolder(folder);
  });

  const pushedElsewhere = async (
    message: string,
    files?: Record<string, string>,
  ): Promise<string> => {
    await other.commit(message, files);
    await other.git('push', 'origin', 'HEAD:main');
    const [pushed] = await other.resolve('HEAD');
    return pushed;
  };

  const pull = () =>
    connection.receive({ type: 'pull', root: repository.root });

  const pulledWith = async (level: 'info' | 'error'): Promise<string[]> => {
    let said: string[] = [];
    await withNotices(page, level, async (messages) => {
      await pull();
      said = messages;
    });
    return said;
  };

  test('fetches, then fast-forwards the checked-out branch to its upstream, revealing the commit it moved to', async () => {
    const pushed = await pushedElsewhere('b', { shared: 'b' });
    page.clear();
    assert.deepStrictEqual(await pulledWith('info'), []);
    assert.deepStrictEqual(await repository.resolve('main'), [pushed]);
    assert.strictEqual(
      fs.readFileSync(path.join(repository.root, 'shared'), 'utf8'),
      'b',
    );
    assert.strictEqual(page.last('repository')?.headCommit, pushed);
    assert.strictEqual(page.last('reveal')?.hash, pushed);
    assert.strictEqual(page.last('pulling')?.running, false);
  });

  test('says it is pulling while it does, and fetching while it fetches', async () => {
    await pushedElsewhere('b');
    page.clear();
    await pull();
    assert.deepStrictEqual(page.messages.flatMap(runningState), [
      'pulling true',
      'fetching true',
      'fetching false',
      'pulling false',
    ]);
  });

  test('says the checked-out branch is up to date when there is nothing to pull', async () => {
    assert.deepStrictEqual(await pulledWith('info'), [
      'main is up to date with origin/main',
    ]);
  });

  test('says the checked-out branch is ahead of its upstream when only it has commits the other lacks', async () => {
    await repository.commit('local only');
    const [local] = await repository.resolve('main');
    assert.deepStrictEqual(await pulledWith('info'), [
      'main is ahead of origin/main, with nothing to pull',
    ]);
    assert.deepStrictEqual(await repository.resolve('main'), [local]);
  });

  test('fast-forwards nothing when the checked-out branch has diverged from its upstream, and says so', async () => {
    await pushedElsewhere('theirs');
    await repository.commit('mine');
    const [mine] = await repository.resolve('main');
    assert.deepStrictEqual(await pulledWith('info'), [
      "main has diverged from origin/main, so it can't be fast-forwarded",
    ]);
    assert.deepStrictEqual(await repository.resolve('main'), [mine]);
  });

  test('neither fetches nor fast-forwards on a detached HEAD, saying it has no upstream', async () => {
    const [before] = await repository.resolve('origin/main');
    await pushedElsewhere('b');
    await repository.git('checkout', '--detach', 'main');
    assert.deepStrictEqual(await pulledWith('info'), [
      'The checked-out commit is on no branch, so it has no upstream',
    ]);
    assert.deepStrictEqual(await repository.resolve('origin/main'), [before]);
  });

  test('neither fetches nor fast-forwards a branch without an upstream, saying so', async () => {
    const [before] = await repository.resolve('origin/main');
    await pushedElsewhere('b');
    await repository.git('checkout', '-b', 'loner');
    try {
      assert.deepStrictEqual(await pulledWith('info'), [
        'loner has no upstream',
      ]);
      assert.deepStrictEqual(await repository.resolve('origin/main'), [before]);
    } finally {
      await repository.git('checkout', '-f', 'main');
      await repository.git('branch', '-D', 'loner');
    }
  });

  test('says the upstream is gone once the fetch drops it, as its branch was deleted on the remote', async () => {
    await repository.git('push', 'origin', 'main:brief');
    await repository.git('checkout', '-b', 'brief', '--track', 'origin/brief');
    await remote.git('branch', '-D', 'brief');
    try {
      assert.deepStrictEqual(await pulledWith('info'), [
        "origin/brief, the upstream of brief, doesn't exist anymore",
      ]);
    } finally {
      await repository.git('checkout', '-f', 'main');
      await repository.git('branch', '-D', 'brief');
    }
  });

  test('fast-forwards nothing when the fetch fails, though an older fetch brought commits to pull', async () => {
    const pushed = await pushedElsewhere('b');
    await repository.git('fetch', 'origin');
    const [before] = await repository.resolve('main');
    await repository.git(
      'remote',
      'set-url',
      'origin',
      path.join(folder, 'missing'),
    );
    try {
      const said = await pulledWith('error');
      assert.strictEqual(said.length, 1);
      assert.match(said[0] ?? '', /^Couldn't fetch\./);
      assert.deepStrictEqual(await repository.resolve('main', 'origin/main'), [
        before,
        pushed,
      ]);
      assert.strictEqual(page.last('pulling')?.running, false);
      takeErrorsLogged(
        logged,
        /^Fetching every remote failed$/,
        /^git -c remote\.origin\.prune=true fetch --all --porcelain failed: /,
      );
    } finally {
      await repository.git('remote', 'set-url', 'origin', remote.root);
    }
  });

  test('fast-forwards nothing over uncommitted changes it would overwrite, keeping them and saying why', async () => {
    await pushedElsewhere('b', { shared: 'theirs', added: 'theirs' });
    const [before] = await repository.resolve('main');
    for (const [file, content] of [
      ['shared', 'mine'],
      ['added', 'mine'],
    ] as const) {
      fs.writeFileSync(path.join(repository.root, file), content);
      const said = await pulledWith('error');
      assert.strictEqual(said.length, 1);
      assert.match(said[0] ?? '', /^Couldn't pull\. .*would be overwritten/s);
      assert.strictEqual(
        fs.readFileSync(path.join(repository.root, file), 'utf8'),
        'mine',
      );
      assert.deepStrictEqual(await repository.resolve('main'), [before]);
      takeErrorsLogged(
        logged,
        /^Pulling failed$/,
        /^git merge --ff-only --no-overwrite-ignore [0-9a-f]{40} failed: /,
      );
      await repository.git('checkout', '--', 'shared');
    }
  });

  test('fast-forwards nothing over ignored files it would overwrite, keeping them and saying why', async () => {
    const exclude = path.join(repository.root, '.git', 'info', 'exclude');
    const excluded = fs.readFileSync(exclude, 'utf8');
    const secret = path.join(repository.root, '.env');
    await pushedElsewhere('b', { '.env': 'template' });
    const [before] = await repository.resolve('main');
    fs.appendFileSync(exclude, '\n.env\n');
    fs.writeFileSync(secret, 'mine');
    try {
      const said = await pulledWith('error');
      assert.strictEqual(said.length, 1);
      assert.match(said[0] ?? '', /^Couldn't pull\. .*would be overwritten/s);
      assert.strictEqual(fs.readFileSync(secret, 'utf8'), 'mine');
      assert.deepStrictEqual(await repository.resolve('main'), [before]);
      takeErrorsLogged(
        logged,
        /^Pulling failed$/,
        /^git merge --ff-only --no-overwrite-ignore [0-9a-f]{40} failed: /,
      );
    } finally {
      fs.writeFileSync(exclude, excluded);
      fs.rmSync(secret, { force: true });
    }
  });

  test('carries uncommitted changes over a fast-forward that leaves their files alone', async () => {
    const pushed = await pushedElsewhere('b', { incoming: 'theirs' });
    fs.writeFileSync(path.join(repository.root, 'shared'), 'mine');
    assert.deepStrictEqual(await pulledWith('error'), []);
    assert.deepStrictEqual(await repository.resolve('main'), [pushed]);
    assert.strictEqual(
      fs.readFileSync(path.join(repository.root, 'shared'), 'utf8'),
      'mine',
    );
  });
});

import { plainOf } from '../../../../../lib/shared/sentences';
import * as assert from 'node:assert';
import * as path from 'node:path';
import { afterAll, beforeAll, suite, test } from 'vitest';
import {
  pushToUpstream,
  type Pushed,
} from '../../../../../tools/git/main/push';
import {
  tempRepository,
  type TempRepository,
} from '../../../../helpers/repositories';
import { recordingLog } from '../../../../helpers/stub';
import { removeFolder, tempFolder } from '../../../../helpers/tempFolders';

type Notices = (readonly ['info' | 'error', string])[];

let folder: string;
let base: TempRepository;
let copies = 0;

beforeAll(async () => {
  folder = tempFolder('push');
  base = await tempRepository(path.join(folder, 'app'));
  await base.commit('a');
  await base.commit('b');
  await base.commit('c');
  await base.git('remote', 'add', 'origin', '.');
});

afterAll(() => {
  removeFolder(folder);
});

function copied(): Promise<TempRepository> {
  copies += 1;
  return base.copy(path.join(folder, String(copies)));
}

async function pushed(
  repository: TempRepository,
): Promise<{ pushed: Pushed; notices: Notices }> {
  const notices: Notices = [];
  const result = await pushToUpstream(
    recordingLog().log,
    (level, message) => notices.push([level, plainOf(message)]),
    { gitPath: repository.gitPath, root: repository.root },
    new AbortController().signal,
  );
  return { pushed: result, notices };
}

async function pushesNothing(
  repository: TempRepository,
  message: string,
): Promise<void> {
  assert.deepStrictEqual(await pushed(repository), {
    pushed: 'unchanged',
    notices: [['info', message]],
  });
}

suite.concurrent('Operations pushing', () => {
  test('pushes nothing from a detached HEAD, saying it has no upstream', async () => {
    const repository = await copied();
    await repository.git('checkout', '--detach', 'main');
    await pushesNothing(
      repository,
      'The checked-out commit is on no branch, so it has no upstream',
    );
  });

  test('publishes nothing when there is no remote, or more than one to choose from, saying so', async () => {
    const repository = await copied();
    await repository.git('checkout', '-b', 'topic');
    await repository.git('remote', 'add', 'second', '.');
    await pushesNothing(
      repository,
      '"topic" has no upstream, and with several remotes, it\'s unclear which to push it to',
    );
    await repository.git('remote', 'remove', 'second');
    await repository.git('remote', 'remove', 'origin');
    await pushesNothing(
      repository,
      '"topic" has no upstream, and there\'s no remote to push it to',
    );
  });

  test('pushes nothing to an upstream deleted on the remote, rather than make it again', async () => {
    const repository = await copied();
    await repository.git('update-ref', 'refs/remotes/origin/brief', 'main');
    await repository.git('checkout', '-b', 'brief', '--track', 'origin/brief');
    await repository.git('update-ref', '-d', 'refs/remotes/origin/brief');
    await repository.commit('more');
    await pushesNothing(
      repository,
      '"origin/brief", the upstream of "brief", doesn\'t exist anymore',
    );
  });

  test("pushes nothing from a branch whose upstream has another name, as git push wouldn't either, saying so", async () => {
    const repository = await copied();
    await repository.git('update-ref', 'refs/remotes/origin/main', 'main');
    await repository.git('checkout', '-b', 'feature', '--track', 'origin/main');
    await repository.commit('feature');
    await pushesNothing(
      repository,
      '"feature" tracks "origin/main", which has another name, so it wasn\'t pushed, as "git push" wouldn\'t push it either',
    );
  });

  test("pushes nothing from a branch whose upstream is a pull request's ref, as git push wouldn't either", async () => {
    const repository = await copied();
    await repository.git('checkout', '-b', 'review');
    await repository.git('config', 'branch.review.remote', 'origin');
    await repository.git('config', 'branch.review.merge', 'refs/pull/1/head');
    await repository.commit('review');
    await pushesNothing(
      repository,
      '"review" tracks "origin/refs/pull/1/head", which has another name, so it wasn\'t pushed, as "git push" wouldn\'t push it either',
    );
  });

  test('pushes nothing to an upstream that is a local branch, saying it has no remote', async () => {
    const repository = await copied();
    await repository.git('checkout', '-b', 'follower', '--track', 'main');
    await repository.commit('more');
    await pushesNothing(
      repository,
      '"follower" tracks the local branch "main", so it has no remote to push to',
    );
  });
});

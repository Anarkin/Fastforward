import * as assert from 'node:assert';
import { execFile } from 'node:child_process';
import * as path from 'node:path';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  suite,
  test,
} from 'vitest';
import {
  removeFolder,
  tempFolder,
  tempRepository,
  type TempRepository,
} from '../support/repositories';

const script = path.join(__dirname, '..', '..', '..', 'scripts', 'push.mts');

suite('Pushing', () => {
  let template: string;
  let templateRemote: TempRepository;
  let templateLocal: TempRepository;
  let templateOther: TempRepository;
  let start: string;
  let folder: string;
  let remote: TempRepository;
  let local: TempRepository;
  let other: TempRepository;

  beforeAll(async () => {
    template = tempFolder('push');
    templateRemote = await tempRepository(path.join(template, 'remote.git'), {
      bare: true,
    });
    templateLocal = await tempRepository(path.join(template, 'local'));
    await templateLocal.commit('start', { a: 'a' });
    await templateLocal.git('remote', 'add', 'origin', '../remote.git');
    await templateLocal.git('push', '-u', 'origin', 'main');
    [start] = await templateLocal.resolve('HEAD');
    templateOther = await tempRepository(path.join(template, 'other'));
    await templateOther.git('remote', 'add', 'origin', '../remote.git');
    await templateOther.git('fetch', 'origin');
    await templateOther.git('reset', '--hard', 'origin/main');
  });

  afterAll(() => removeFolder(template));

  beforeEach(async () => {
    folder = tempFolder('push');
    remote = await templateRemote.copy(path.join(folder, 'remote.git'));
    local = await templateLocal.copy(path.join(folder, 'local'));
    other = await templateOther.copy(path.join(folder, 'other'));
  });

  afterEach(() => removeFolder(folder));

  const pushing = () =>
    new Promise<{ code: number; said: string }>((resolve) => {
      const env = { ...process.env };
      delete env.GH_REPO;
      execFile(
        process.execPath,
        [script],
        { cwd: local.root, env },
        (error, _stdout, stderr) =>
          resolve({
            code: typeof error?.code === 'number' ? error.code : 0,
            said: stderr,
          }),
      );
    });

  test('pushes the commit to main, and says at once that it could not watch its CI run, apart from a failed one, when gh does not work here', async () => {
    await local.commit('local', { b: 'b' });
    const { code, said } = await pushing();
    assert.deepStrictEqual(
      await remote.resolve('main'),
      await local.resolve('HEAD'),
    );
    assert.strictEqual(code, 2);
    assert.match(
      said,
      /Pushed [0-9a-f]{40}, but could not watch its CI run, as gh does not work here/,
    );
  });

  test('refuses to push from a branch other than main, leaving main on the remote as it was', async () => {
    await local.git('switch', '-q', '-c', 'feature');
    await local.commit('on feature', { b: 'b' });
    const { code, said } = await pushing();
    assert.strictEqual(code, 1);
    assert.match(said, /main branch/);
    assert.deepStrictEqual(await remote.resolve('main'), [start]);
  });

  test('never forces a push the remote refuses, leaving the commits of the remote, and watches no CI run', async () => {
    await other.commit('pushed elsewhere', { c: 'c' });
    await other.git('push', 'origin', 'HEAD:main');
    await local.commit('local', { d: 'd' });
    const { code, said } = await pushing();
    assert.strictEqual(code, 1);
    assert.match(said, /never force/);
    assert.doesNotMatch(said, /CI run/);
    assert.deepStrictEqual(
      await remote.resolve('main'),
      await other.resolve('HEAD'),
    );
  });
});

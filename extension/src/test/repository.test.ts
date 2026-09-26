import * as assert from 'node:assert';
import type { API, Repository } from '../git/git';
import { getGitApi, listRefs } from '../git/repository';
import { countCommits, logCommits, showFiles, showPatch } from '../git/show';

// .vscode-test.mjs opens this repository as the workspace
suite('Git repository', () => {
  let git: API;
  let repository: Repository;

  suiteSetup(async function () {
    this.timeout(20_000);
    git = await getGitApi();
    for (let i = 0; i < 100 && git.repositories.length === 0; i++) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.ok(git.repositories[0], 'repository not found');
    repository = git.repositories[0];
    await repository.status();
  });

  test('lists refs including the current branch', async () => {
    const head = repository.state.HEAD?.name;
    assert.ok(head, 'no HEAD branch');
    assert.ok(
      (await listRefs(repository)).some(
        (ref) => ref.kind === 'branch' && ref.name === head,
      ),
    );
  });

  test('lists commits, their files and patches', async () => {
    const commits = await logCommits(
      git.git.path,
      repository.rootUri.fsPath,
      undefined,
      0,
      100_000,
    );
    assert.ok(commits.every((commit) => commit.hash.length === 40));

    assert.strictEqual(
      await countCommits(git.git.path, repository.rootUri.fsPath, undefined),
      commits.length,
    );

    // Pages continue where the previous one ended
    const [second] = await logCommits(
      git.git.path,
      repository.rootUri.fsPath,
      undefined,
      1,
      1,
    );
    assert.strictEqual(second?.hash, commits[1]?.hash);
    // The oldest commit is the root, or the shallow clone boundary in CI;
    // either way git show lists all its files as added
    const root = commits.at(-1);
    assert.ok(root);
    const cwd = repository.rootUri.fsPath;
    const files = await showFiles(git.git.path, cwd, root.hash);
    assert.ok(files.length > 0);
    assert.ok(files.every((file) => file.status === 'A'));

    const patch = await showPatch(git.git.path, cwd, root.hash, files[0].path);
    assert.ok(patch.includes(`b/${files[0].path}`));
  });
});

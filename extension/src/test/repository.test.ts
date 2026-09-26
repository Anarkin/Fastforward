import * as assert from 'node:assert';
import * as vscode from 'vscode';
import type { API, Repository } from '../git/git';
import { getGitApi, listRefs } from '../git/repository';
import { listHistory, logCommits, showFiles, showPatch } from '../git/show';

// .vscode-test.mjs opens this repository as the workspace
suite('Git repository', () => {
  let git: API;
  let repository: Repository;

  suiteSetup(async function () {
    this.timeout(20_000);
    git = await getGitApi();
    // The workspace's repository; other tests open temp repositories too
    const folder = vscode.workspace.workspaceFolders?.[0]?.uri;
    assert.ok(folder, 'no workspace folder');
    let found = git.getRepository(folder);
    for (let i = 0; i < 100 && !found; i++) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      found = git.getRepository(folder);
    }
    assert.ok(found, 'repository not found');
    repository = found;
    await repository.status();
  });

  test('lists refs including the current branch', async () => {
    const head = repository.state.HEAD?.name;
    assert.ok(head, 'no HEAD branch');
    const refs = await listRefs(repository);
    assert.ok(refs.some((ref) => ref.kind === 'branch' && ref.name === head));
    assert.ok(!refs.some((ref) => ref.name.endsWith('/HEAD')));
  });

  test('lists the history, its commits, their files and patches', async () => {
    const cwd = repository.rootUri.fsPath;
    const history = await listHistory(git.git.path, cwd);
    assert.ok(history.length > 0);
    assert.ok(history.every((entry) => entry.hash.length === 40));

    // Commits come back in the order of the hashes asked for
    const hashes = history.slice(0, 3).map((entry) => entry.hash);
    const commits = await logCommits(git.git.path, cwd, hashes.toReversed());
    assert.deepStrictEqual(
      commits.map((commit) => commit.hash),
      hashes.toReversed(),
    );

    // A root commit, or the shallow clone boundary in CI, has no parents;
    // either way git show lists all its files as added
    const root = history.find((entry) => entry.parents.length === 0);
    assert.ok(root);
    const files = await showFiles(git.git.path, cwd, root.hash);
    assert.ok(files.length > 0);
    assert.ok(files.every((file) => file.status === 'A'));

    const patch = await showPatch(git.git.path, cwd, root.hash, files[0].path);
    assert.ok(patch.includes(`b/${files[0].path}`));
  });
});

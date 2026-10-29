import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { suite, test } from 'vitest';
import {
  ignoredPaths,
  watchRepository,
  type Changed,
} from '../../../../../tools/git/main/cli/watch';
import { waitFor } from '../../../../fixtures';
import {
  createsAnewThroughJunctions,
  removeFolder,
  tempFolder,
  tempRepository,
} from '../../../../repositories';
import {
  askingGit,
  changes,
  errors,
  keepWriting,
  repository,
  settled,
  startWatching,
  stopWatching,
  untilQuiet,
  watchingRepositories,
  worktreeInBareRepository,
} from './watchFixtures';

suite('Watching a repository recursively and folder by folder', () => {
  watchingRepositories();

  for (const recursive of [true, false]) {
    test(`asks a submodule whether a file changed in it is ignored, as its superproject refuses to tell, staying quiet for one its own .gitignore ignores and refreshing for one it tracks, watching ${recursive ? 'recursively' : 'folder by folder'}`, async () => {
      const library = await tempRepository(path.join(repository.root, 'sub'));
      await library.commit('library', { '.gitignore': '*.o\n', 'lib.c': '' });
      await repository.git('add', '--no-warn-embedded-repo', 'sub');
      const built = path.join(library.root, 'lib.o');
      fs.writeFileSync(built, '');
      const checked: string[] = [];
      await startWatching({
        delay: 50,
        maxDelay: 200,
        recursive,
        onChange: ({ refs }) => changes.push(refs),
        onError: (error) => errors.push(error),
        ignored: (repo, paths) => {
          checked.push(...paths);
          return ignoredPaths(repository.gitPath, repo, paths);
        },
      });
      await settled();
      await keepWriting(built, 'the ignored file in the submodule', () =>
        checked.includes(built),
      );
      await new Promise((resolve) => setTimeout(resolve, 300));
      assert.ok(!changes.includes(false), 'the ignored file in the submodule');
      await keepWriting(path.join('sub', 'lib.c'), 'the file in the submodule');
      assert.deepStrictEqual(errors, []);
    });

    test(`stays quiet for ignored files made and removed in a folder that is not ignored, which Windows tells changed along with them, watching ${recursive ? 'recursively' : 'folder by folder'}`, async () => {
      fs.appendFileSync(path.join(repository.root, '.gitignore'), '*.tmp\n');
      const folder = path.join(repository.root, 'src');
      fs.mkdirSync(folder);
      fs.writeFileSync(path.join(folder, 'kept.txt'), '');
      const checked: string[] = [];
      await startWatching({
        delay: 50,
        maxDelay: 200,
        recursive,
        onChange: ({ refs }) => changes.push(refs),
        onError: (error) => errors.push(error),
        ignored: (repo, paths) => {
          checked.push(...paths);
          return ignoredPaths(repository.gitPath, repo, paths);
        },
      });
      await settled();
      for (let made = 0; made < 3; made++) {
        const file = path.join(folder, `x${made}.tmp`);
        fs.writeFileSync(file, '');
        await waitFor(
          () => checked.includes(file) || changes.length > 0,
          'the ignored file made',
        );
        fs.rmSync(file);
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      await new Promise((resolve) => setTimeout(resolve, 300));
      assert.ok(!changes.includes(false), 'the ignored files');
      assert.deepStrictEqual(errors, []);
    });

    test(`stays quiet for an ignored folder made again, which git tells is not ignored while it is missing, watching ${recursive ? 'recursively' : 'folder by folder'}`, async () => {
      const folder = path.join(repository.root, 'ignored');
      const git = askingGit();
      await startWatching({
        delay: 50,
        maxDelay: 200,
        recursive,
        onChange: ({ refs }) => changes.push(refs),
        onError: (error) => errors.push(error),
        ignored: git.ignored,
      });
      await settled(git.busy);
      git.answered.length = 0;
      fs.rmSync(folder, { recursive: true });
      await waitFor(() => git.answered.includes(folder), 'the folder removed');
      await settled(git.busy);
      git.asked.length = 0;
      fs.mkdirSync(folder);
      fs.writeFileSync(path.join(folder, 'out.txt'), '');
      await waitFor(
        () => git.asked.includes(folder) || changes.length > 0,
        'the folder made again',
      );
      await untilQuiet(() => changes.length, git.busy, 'the folder made again');
      assert.ok(!changes.includes(false), 'the folder made again');
      assert.deepStrictEqual(errors, []);
    });

    test(`stays quiet for the cookies of the fsmonitor daemon, which every refresh would make again, watching ${recursive ? 'recursively' : 'folder by folder'}`, async () => {
      const cookies = path.join(
        repository.root,
        '.git',
        'fsmonitor--daemon',
        'cookies',
      );
      fs.mkdirSync(cookies, { recursive: true });
      await startWatching({
        delay: 50,
        maxDelay: 200,
        recursive,
        onChange: ({ refs }) => changes.push(refs),
        onError: (error) => errors.push(error),
      });
      await settled();
      fs.writeFileSync(path.join(cookies, '1234-0'), '');
      fs.rmSync(path.join(cookies, '1234-0'));
      await keepWriting(
        'file.txt',
        'the changed file',
        () => changes.length > 0,
      );
      assert.strictEqual(changes.includes(true), false);
      assert.deepStrictEqual(errors, []);
    });

    test(`refreshes for a commit in a submodule with a folder named like logs in its path, watching ${recursive ? 'recursively' : 'folder by folder'}`, async () => {
      const sub = await tempRepository(
        path.join(repository.root, 'deps', 'logs', 'parser'),
      );
      await sub.commit('parser');
      fs.writeFileSync(
        path.join(repository.root, '.gitmodules'),
        '[submodule "deps/logs/parser"]\n\tpath = deps/logs/parser\n\turl = ./parser\n',
      );
      await repository.git('add', '--no-warn-embedded-repo', '.');
      await repository.git('submodule', 'absorbgitdirs');
      await startWatching({
        delay: 50,
        maxDelay: 200,
        recursive,
        onChange: ({ refs }) => changes.push(refs),
        onError: (error) => errors.push(error),
      });
      await settled();
      await sub.commit('second');
      await waitFor(() => changes.includes(true), 'the commit');
      assert.deepStrictEqual(errors, []);
    });

    test(`refreshes for a commit in a repository whose git folder is inside the working tree, but stays quiet while only its objects are written, as a fetch or gc there does, watching ${recursive ? 'recursively' : 'folder by folder'}`, async () => {
      const nested = await tempRepository(path.join(repository.root, 'lib'));
      await nested.commit('library', { 'lib.c': '' });
      await repository.git('add', '--no-warn-embedded-repo', 'lib');
      await startWatching({
        delay: 50,
        maxDelay: 200,
        recursive,
        onChange: ({ refs }) => changes.push(refs),
        onError: (error) => errors.push(error),
      });
      await settled();
      const pack = path.join(nested.root, '.git', 'objects', 'pack');
      const until = Date.now() + 600;
      for (let written = 0; Date.now() < until; written++) {
        fs.writeFileSync(path.join(pack, `tmp_pack_${written}`), 'pack');
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      await new Promise((resolve) => setTimeout(resolve, 300));
      assert.deepStrictEqual(changes, []);
      let commits = 0;
      await waitFor(async () => {
        await nested.commit(`${commits++}`);
        return changes.includes(false);
      }, 'a commit in the nested repository');
      assert.deepStrictEqual(errors, []);
    });

    test(`refreshes for a commit when .git links to a folder elsewhere, which watching the folder it is in does not follow, watching ${recursive ? 'recursively' : 'folder by folder'}`, async (context) => {
      if (!createsAnewThroughJunctions()) {
        context.skip();
      }
      const store = tempFolder('store');
      const gitDir = path.join(store, 'project.git');
      fs.renameSync(path.join(repository.root, '.git'), gitDir);
      fs.symlinkSync(gitDir, path.join(repository.root, '.git'), 'junction');
      try {
        await startWatching({
          delay: 50,
          maxDelay: 200,
          recursive,
          onChange: ({ refs }) => changes.push(refs),
          onError: (error) => errors.push(error),
        });
        await settled();
        let commits = 0;
        await waitFor(async () => {
          await repository.git('commit', '--allow-empty', '-m', `${commits++}`);
          return changes.includes(true);
        }, 'a commit');
        assert.deepStrictEqual(errors, []);
      } finally {
        await stopWatching();
        removeFolder(store);
      }
    });

    test(`stays quiet for a fetch that brings nothing, though Windows tells the remote's folder changed for the lock it makes on its HEAD, and refreshes refs alone for one that brings commits, a tag or a branch, watching ${recursive ? 'recursively' : 'folder by folder'}`, async () => {
      const upstream = await tempRepository(tempFolder('upstream'));
      await upstream.commit('one');
      await repository.git('remote', 'add', 'origin', upstream.root);
      await repository.git('fetch', '-q', 'origin');
      const seen: Changed[] = [];
      await startWatching({
        delay: 50,
        maxDelay: 200,
        recursive,
        onChange: (change) => seen.push(change),
        onError: (error) => errors.push(error),
      });
      try {
        let last = seen.length;
        let since = Date.now();
        await waitFor(() => {
          if (seen.length !== last) {
            last = seen.length;
            since = Date.now();
          }
          return Date.now() - since > 500;
        }, 'the folders read while starting to be told');
        seen.length = 0;
        await repository.git('fetch', '--all', '--prune');
        await keepWriting(
          'file.txt',
          'the changed file',
          () => seen.length > 0,
        );
        assert.deepStrictEqual(
          seen.filter((change) => change.refs),
          [],
          'the fetch that brought nothing',
        );
        await new Promise((resolve) => setTimeout(resolve, 500));
        for (const change of [
          () => upstream.commit('two'),
          () => upstream.git('tag', 'v1'),
          () => upstream.git('branch', 'feature'),
        ]) {
          await change();
          seen.length = 0;
          await repository.git('fetch', '--all', '--prune');
          await waitFor(() => seen.length > 0, 'the fetch');
          await new Promise((resolve) => setTimeout(resolve, 300));
          assert.ok(
            seen.every((told) => told.refs && !told.workingTree),
            JSON.stringify(seen),
          );
        }
        seen.length = 0;
        await repository.git('commit', '--allow-empty', '-m', 'local');
        await waitFor(
          () => seen.some((told) => told.refs && told.workingTree),
          'a commit',
        );
        assert.deepStrictEqual(errors, []);
      } finally {
        removeFolder(upstream.root);
      }
    });

    test(`tells when a worktree is added, watching ${recursive ? 'recursively' : 'folder by folder'}`, async () => {
      const folder = tempFolder('listed');
      let listed = 0;
      const listing = await watchRepository(
        repository.gitPath,
        repository.root,
        {
          delay: 50,
          maxDelay: 200,
          recursive,
          onChange: () => undefined,
          onWorktreesChange: () => listed++,
          onError: (error) => errors.push(error),
        },
      );
      try {
        let added = 0;
        await waitFor(async () => {
          await repository.git(
            'worktree',
            'add',
            '-q',
            '--detach',
            path.join(folder, `linked-${added++}`),
          );
          return listed > 0;
        }, 'a worktree added');
        assert.deepStrictEqual(errors, []);
      } finally {
        await listing.dispose();
        removeFolder(folder);
      }
    });

    test(`tells when a linked worktree switches branch, watching ${recursive ? 'recursively' : 'folder by folder'}`, async () => {
      const folder = tempFolder('switched');
      const linked = path.join(folder, 'linked');
      await repository.git('worktree', 'add', '-q', '--detach', linked);
      let listed = 0;
      const listing = await watchRepository(
        repository.gitPath,
        repository.root,
        {
          delay: 50,
          maxDelay: 200,
          recursive,
          onChange: () => undefined,
          onWorktreesChange: () => listed++,
          onError: (error) => errors.push(error),
        },
      );
      try {
        let last = listed;
        let since = Date.now();
        await waitFor(() => {
          if (listed !== last) {
            last = listed;
            since = Date.now();
          }
          return Date.now() - since > 500;
        }, 'the worktree added to be told');
        listed = 0;
        await repository.git('-C', linked, 'switch', '-q', '-c', 'switched');
        await waitFor(() => listed > 0, 'the branch switched to');
        assert.deepStrictEqual(errors, []);
      } finally {
        await listing.dispose();
        removeFolder(folder);
      }
    });

    test(`tells when a linked worktree or the main one switches branch under the reftable ref format, which leaves each HEAD file as it was, watching ${recursive ? 'recursively' : 'folder by folder'}`, async () => {
      await repository.git('refs', 'migrate', '--ref-format=reftable');
      const folder = tempFolder('reftable');
      const linked = path.join(folder, 'linked');
      await repository.git('worktree', 'add', '-q', '--detach', linked);
      let listed = 0;
      const listing = await watchRepository(
        repository.gitPath,
        repository.root,
        {
          delay: 50,
          maxDelay: 200,
          recursive,
          onChange: () => undefined,
          onWorktreesChange: () => listed++,
          onError: (error) => errors.push(error),
        },
      );
      const switched = async (where: string, what: string) => {
        let last = listed;
        let since = Date.now();
        await waitFor(() => {
          if (listed !== last) {
            last = listed;
            since = Date.now();
          }
          return Date.now() - since > 500;
        }, 'the worktrees listed to be told');
        listed = 0;
        await repository.git('-C', where, 'switch', '-q', '-c', what);
        await waitFor(() => listed > 0, what);
      };
      try {
        await switched(linked, 'linked-switched');
        await switched(repository.root, 'main-switched');
        assert.deepStrictEqual(errors, []);
      } finally {
        await listing.dispose();
        removeFolder(folder);
      }
    });

    test(`tells when a linked worktree switches branch among more changes than Windows tells at once, which it drops, telling only that something changed, watching ${recursive ? 'recursively' : 'folder by folder'}`, async () => {
      const folder = tempFolder('dropped');
      const linked = path.join(folder, 'linked');
      await repository.git('worktree', 'add', '-q', '--detach', linked);
      await repository.git('branch', 'switched');
      const linkedGitDir = path.join(repository.root, '.git/worktrees/linked');
      let listed = 0;
      const listing = await watchRepository(
        repository.gitPath,
        repository.root,
        {
          delay: 50,
          maxDelay: 200,
          recursive,
          onChange: () => undefined,
          onWorktreesChange: () => listed++,
          onError: (error) => errors.push(error),
        },
      );
      try {
        let last = listed;
        let since = Date.now();
        await waitFor(() => {
          if (listed !== last) {
            last = listed;
            since = Date.now();
          }
          return Date.now() - since > 500;
        }, 'the worktree added to be told');
        listed = 0;
        for (let file = 0; file < 300; file++) {
          fs.writeFileSync(path.join(linkedGitDir, `written-${file}`), '');
        }
        fs.writeFileSync(
          path.join(linkedGitDir, 'HEAD'),
          'ref: refs/heads/switched\n',
        );
        await waitFor(() => listed > 0, 'the branch switched to');
        assert.deepStrictEqual(errors, []);
      } finally {
        await listing.dispose();
        removeFolder(folder);
      }
    });

    test(`refreshes a linked worktree for a branch made in the main one, watching ${recursive ? 'recursively' : 'folder by folder'}`, async () => {
      const folder = tempFolder('linked');
      const linked = path.join(folder, 'linked');
      await repository.git('worktree', 'add', '-q', '--detach', linked);
      const seen: boolean[] = [];
      const linkedWatcher = await watchRepository(repository.gitPath, linked, {
        delay: 50,
        maxDelay: 200,
        recursive,
        onChange: ({ refs }) => seen.push(refs),
        onError: (error) => errors.push(error),
      });
      try {
        let branches = 0;
        await waitFor(async () => {
          await repository.git('branch', `made-${branches++}`);
          return seen.includes(true);
        }, 'the branch');
        assert.deepStrictEqual(errors, []);
      } finally {
        await linkedWatcher.dispose();
        removeFolder(folder);
      }
    });

    test(`refreshes a worktree inside its bare repository's folder for a file changed two folders down, watching ${recursive ? 'recursively' : 'folder by folder'}`, async () => {
      const { folder, worktree } = await worktreeInBareRepository();
      const file = path.join(worktree, 'src', 'deep', 'file.txt');
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, '');
      const seen: boolean[] = [];
      const watching = await watchRepository(repository.gitPath, worktree, {
        delay: 50,
        maxDelay: 200,
        recursive,
        onChange: ({ refs }) => seen.push(refs),
        onError: (error) => errors.push(error),
      });
      try {
        await keepWriting(file, 'the changed file', () => seen.includes(false));
        assert.deepStrictEqual(errors, []);
      } finally {
        await watching.dispose();
        removeFolder(folder);
      }
    });
  }
});

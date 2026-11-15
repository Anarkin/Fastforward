import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  gitDirChanged,
  nextFlush,
  watchesRecursively,
} from '../../../../../tools/git/main/watch';

suite('Debouncing changes', () => {
  test('waits the delay after the last change', () => {
    assert.deepStrictEqual(
      nextFlush({ firstWorkTree: 0, lastWorkTree: 0 }, 300, 1500),
      { at: 300, gitDir: false },
    );
    assert.deepStrictEqual(
      nextFlush({ firstWorkTree: 0, lastWorkTree: 1000 }, 300, 1500),
      { at: 1300, gitDir: false },
    );
  });

  test('flushes work tree changes at most the longest wait after the first one, however often files keep changing', () => {
    assert.deepStrictEqual(
      nextFlush({ firstWorkTree: 0, lastWorkTree: 1400 }, 300, 1500),
      { at: 1500, gitDir: false },
    );
    assert.deepStrictEqual(
      nextFlush({ firstWorkTree: 0, lastWorkTree: 2000 }, 300, 1500),
      { at: 1500, gitDir: false },
    );
  });

  test('waits for the git folder to stop changing, as a long rebase keeps writing it', () => {
    assert.deepStrictEqual(nextFlush({ lastGitDir: 10_000 }, 300, 1500), {
      at: 10_300,
      gitDir: true,
    });
  });

  test('flushes the work tree alone while the git folder keeps changing', () => {
    assert.deepStrictEqual(
      nextFlush(
        { firstWorkTree: 0, lastWorkTree: 1400, lastGitDir: 1400 },
        300,
        1500,
      ),
      { at: 1500, gitDir: false },
    );
  });

  test('flushes a quiet git folder with the work tree, however often files keep changing', () => {
    assert.deepStrictEqual(
      nextFlush(
        { firstWorkTree: 0, lastWorkTree: 1000, lastGitDir: 100 },
        300,
        1500,
      ),
      { at: 400, gitDir: true },
    );
  });

  test('refreshes refs alone only while every change to the git folder since the last flush changed refs alone', () => {
    const remote = gitDirChanged({}, 100, true);
    assert.deepStrictEqual(remote, { lastGitDir: 100, refsAlone: true });
    assert.deepStrictEqual(gitDirChanged(remote, 200, true), {
      lastGitDir: 200,
      refsAlone: true,
    });
    const index = gitDirChanged(remote, 200, false);
    assert.deepStrictEqual(index, { lastGitDir: 200, refsAlone: false });
    assert.deepStrictEqual(gitDirChanged(index, 300, true), {
      lastGitDir: 300,
      refsAlone: false,
    });
    assert.deepStrictEqual(
      gitDirChanged({ firstWorkTree: 0, lastWorkTree: 50 }, 100, true),
      { firstWorkTree: 0, lastWorkTree: 50, lastGitDir: 100, refsAlone: true },
    );
  });

  test('waits longer after the git folder changes than after files do, as an editor writes a file at once while git keeps writing its folder', () => {
    assert.deepStrictEqual(
      nextFlush({ firstWorkTree: 0, lastWorkTree: 0 }, 100, 1500, 300),
      { at: 100, gitDir: false },
    );
    assert.deepStrictEqual(nextFlush({ lastGitDir: 0 }, 100, 1500, 300), {
      at: 300,
      gitDir: true,
    });
    assert.deepStrictEqual(
      nextFlush(
        { firstWorkTree: 0, lastWorkTree: 0, lastGitDir: 0 },
        100,
        1500,
        300,
      ),
      { at: 100, gitDir: false },
    );
  });

  test('has nothing to flush without changes', () => {
    assert.strictEqual(nextFlush({}, 300, 1500), undefined);
  });
});

suite('Watching folders recursively', () => {
  test('watches recursively but on Linux, where Node walks the whole tree synchronously with one inotify watch per file', () => {
    assert.strictEqual(watchesRecursively('win32'), true);
    assert.strictEqual(watchesRecursively('darwin'), true);
    assert.strictEqual(watchesRecursively('linux'), false);
  });
});

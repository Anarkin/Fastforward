import * as assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { suite, test } from 'vitest';

interface CommitMessage {
  readonly types: readonly string[];
  readonly cleanedUp: (raw: string) => string;
  readonly problemsOf: (message: string) => string[];
}

async function loadCommitMessage(): Promise<CommitMessage> {
  const loaded: CommitMessage = await import(
    pathToFileURL(
      path.join(__dirname, '..', '..', '..', 'scripts', 'commitMessage.mts'),
    ).href
  );
  return loaded;
}

const firstLineProblem =
  'line 1: not <type>[(<scope>)][!]: <description>, of the types fix, feat, refactor, test, perf, docs, style, chore, ci, build, revert';

suite('Commit messages', () => {
  test('takes a first line of a type, a scope and a ! if any, and a description, alone or with bullets after a blank line', async () => {
    const { problemsOf } = await loadCommitMessage();
    for (const message of [
      'fix: a',
      'feat(view)!: a',
      'refactor(commit-list): a',
      'perf(2d): a',
      'docs: a\n\n- b',
      'test: a\n\n- b\n- c\n',
      'fix: a\n\n- #12 was closed twice\n- -1 is kept: as it was',
    ]) {
      assert.deepStrictEqual(problemsOf(message), [], message);
    }
  });

  test('takes a first line of 72 characters, each counted as a reader sees it, an emoji joined from several or a letter with its accent as one, and a bullet of any length, as bullets are never wrapped', async () => {
    const { problemsOf } = await loadCommitMessage();
    for (const message of [
      `fix: ${'x'.repeat(67)}`,
      `fix: ${'😀'.repeat(67)}`,
      `fix: ${'👨‍👩‍👧'.repeat(67)}`,
      `fix: ${'é'.repeat(67)}`,
      `fix: a\n\n- ${'y'.repeat(500)}`,
    ]) {
      assert.deepStrictEqual(problemsOf(message), [], message);
    }
  });

  test('names each line that breaks the rules of CONTRIBUTING.md and the rule it breaks', async () => {
    const { problemsOf } = await loadCommitMessage();
    assert.deepStrictEqual(
      problemsOf(
        `Fix: ${'x'.repeat(80)}\n- a\n\n- b\n  wrapped\n* c\n- \n\nCo-authored-by: x`,
      ),
      [
        firstLineProblem,
        'line 1: 85 characters, at most 72',
        'line 2: not blank',
        'line 3: a blank line in the body',
        'line 5: not a bullet, - <bullet> on one line',
        'line 6: not a bullet, - <bullet> on one line',
        'line 7: not a bullet, - <bullet> on one line',
        'line 8: a blank line in the body',
        'line 9: a footer or trailer',
      ],
    );
  });

  test('refuses a type it does not allow, a scope of other than lowercase words joined by hyphens, a ! before the scope and a description not after a colon and a space', async () => {
    const { problemsOf } = await loadCommitMessage();
    for (const message of [
      'feta: a',
      'Fix: a',
      'fix(View): a',
      'fix(-x): a',
      'fix(x-): a',
      'fix(): a',
      'fix!(x): a',
      'fix:a',
      'fix:  a',
      'fix: ',
      '',
    ]) {
      assert.deepStrictEqual(problemsOf(message), [firstLineProblem], message);
    }
  });

  test('refuses a first line of 73 characters, an emoji counted as one', async () => {
    const { problemsOf } = await loadCommitMessage();
    assert.deepStrictEqual(problemsOf(`fix: ${'😀'.repeat(68)}`), [
      'line 1: 73 characters, at most 72',
    ]);
  });

  test('refuses a footer or trailer of any kind, after the bullets or after a blank line, and the message git writes for a revert', async () => {
    const { problemsOf } = await loadCommitMessage();
    assert.deepStrictEqual(
      problemsOf('fix: a\n\n- b\nSigned-off-by: x\nFixes #12'),
      ['line 4: a footer or trailer', 'line 5: a footer or trailer'],
    );
    assert.deepStrictEqual(problemsOf('fix: a\n\nCo-authored-by: x'), [
      'line 3: a footer or trailer',
    ]);
    assert.deepStrictEqual(
      problemsOf(
        'Revert "fix: a"\n\nThis reverts commit 28b9fc343cbe277cc538f6bb6b3f906922bfd17c.',
      ),
      [firstLineProblem, 'line 3: not a bullet, - <bullet> on one line'],
    );
  });

  test('cleans a message up as git does before it stores it, dropping its comments, what follows the scissors, the blanks ending a line, the carriage returns and the blank lines around it, and joining runs of blank lines into one', async () => {
    const { cleanedUp } = await loadCommitMessage();
    assert.strictEqual(
      cleanedUp(
        '\n\nfix: a  \r\n\r\n\r\n- b \n# Please enter the commit message\n#\n# ------------------------ >8 ------------------------\r\ndiff --git a/a b/a\n',
      ),
      'fix: a\n\n- b',
    );
  });

  test('allows the types CONTRIBUTING.md lists, in its order', async () => {
    const { types } = await loadCommitMessage();
    const contributing = fs.readFileSync(
      path.join(__dirname, '..', '..', '..', '..', 'CONTRIBUTING.md'),
      'utf8',
    );
    const listed = /^ {2}- Allowed types: (.+)$/m.exec(contributing)?.[1];
    assert.deepStrictEqual(
      [...(listed ?? '').matchAll(/`([a-z]+)`/g)].map(([, type]) => type),
      types,
    );
  });
});

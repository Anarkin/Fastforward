import * as assert from 'node:assert';
import { renderToStaticMarkup } from 'react-dom/server';
import { workingTreeHash, type CommitInfo } from '../protocol';
import { CommitHistory } from '../webview/commitHistory';
import {
  bubbleLineHeight,
  commitRowHeight,
  CommitBubbles,
  estimatedRowHeight,
  rowKeyOf,
} from '../webview/commitList';

function commit(hash: string): CommitInfo {
  return {
    hash,
    subject: hash,
    message: hash,
    parents: [],
    authorName: '',
    authorEmail: '',
    authorDate: 0,
    committerName: '',
    committerEmail: '',
    commitDate: 0,
    files: 0,
  };
}

suite('Commit list rows', () => {
  test('starts a row with bubbles at one line of them', () => {
    // Refs point at the second commit
    const history = new CommitHistory(3, [[1, 2]]);
    assert.strictEqual(estimatedRowHeight(history, 0, 0), commitRowHeight);
    assert.strictEqual(
      estimatedRowHeight(history, 0, 1),
      commitRowHeight + bubbleLineHeight,
    );
    // Below the working tree's row, which has no bubbles
    assert.strictEqual(estimatedRowHeight(history, 1, 0), commitRowHeight);
    assert.strictEqual(
      estimatedRowHeight(history, 1, 2),
      commitRowHeight + bubbleLineHeight,
    );
  });

  test('keys a row by its commit, so it keeps its height as the list changes', () => {
    const history = new CommitHistory(3);
    history.add(0, [commit('a'), commit('b')]);
    assert.strictEqual(rowKeyOf(history, 1, 0), workingTreeHash);
    assert.strictEqual(rowKeyOf(history, 1, 2), 'b');
    // The same commit one row higher without the working tree's row
    assert.strictEqual(rowKeyOf(history, 0, 1), 'b');
    // Not loaded yet
    assert.strictEqual(rowKeyOf(history, 0, 2), 'position 2');
  });

  test("puts a commit's bubbles on one line that wraps", () => {
    const html = renderToStaticMarkup(
      <CommitBubbles
        hash={'a'.repeat(40)}
        refs={[
          { kind: 'branch', name: 'main', commit: 'a'.repeat(40) },
          { kind: 'remote', name: 'origin/main', commit: 'a'.repeat(40) },
        ]}
        detached
      />,
    );
    assert.strictEqual(html.match(/class="bubble-line"/g)?.length, 1);
    assert.match(
      html,
      /^<div class="bubble-line"><span class="badge head[^>]*>HEAD aaaaaaa<\/span><span class="badge branch[^>]*>main<\/span><span class="badge remote[^>]*>origin\/main<\/span><\/div>$/,
    );
  });

  test('draws no bubble line for a commit without refs', () => {
    assert.strictEqual(
      renderToStaticMarkup(
        <CommitBubbles hash={'a'.repeat(40)} refs={[]} detached={false} />,
      ),
      '',
    );
  });
});

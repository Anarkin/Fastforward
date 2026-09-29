import * as assert from 'node:assert';
import { renderToStaticMarkup } from 'react-dom/server';
import { workingTreeHash } from '../shared/protocol';
import { CommitHistory } from '../webview/commitHistory';
import {
  arrowKeyPosition,
  bubbleLineHeight,
  commitRowHeight,
  CommitBubbles,
  estimatedRowHeight,
  fixedRowHeight,
  listTop,
  rowKeyOf,
} from '../webview/commitList';
import { commitInfo } from './fixtures';

suite('Commit list rows', () => {
  test('starts a row with bubbles at one line of them', () => {
    const history = new CommitHistory(3, [[1, 2]]);
    assert.strictEqual(estimatedRowHeight(history, 0, 0), commitRowHeight);
    assert.strictEqual(
      estimatedRowHeight(history, 0, 1),
      commitRowHeight + bubbleLineHeight,
    );
    assert.strictEqual(estimatedRowHeight(history, 1, 0), commitRowHeight);
    assert.strictEqual(
      estimatedRowHeight(history, 1, 2),
      commitRowHeight + bubbleLineHeight,
    );
  });

  test('keys a row by its commit, so it keeps its height as the list changes', () => {
    const history = new CommitHistory(3);
    history.add(0, [commitInfo('a'), commitInfo('b')]);
    assert.strictEqual(rowKeyOf(history, 1, 0), workingTreeHash);
    assert.strictEqual(rowKeyOf(history, 1, 2), 'b');
    assert.strictEqual(rowKeyOf(history, 0, 1), 'b');
    assert.strictEqual(rowKeyOf(history, 0, 2), 'position 2');
  });

  test("keeps a commit not loaded yet at the height it is estimated at, so the list doesn't move when it loads", () => {
    const history = new CommitHistory(3);
    history.add(0, [commitInfo('a')]);
    assert.strictEqual(fixedRowHeight(history, 1, 0, 30), undefined);
    assert.strictEqual(fixedRowHeight(history, 1, 1, 30), undefined);
    assert.strictEqual(fixedRowHeight(history, 1, 2, 30), 30);
    assert.strictEqual(fixedRowHeight(undefined, 0, 0, 30), 30);
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

suite('Commit list top', () => {
  const rows = [0, 1, 2].map((index) => ({
    index,
    start: index * commitRowHeight,
    end: (index + 1) * commitRowHeight,
  }));

  test('is the commit scrolled into, once it is loaded', () => {
    const history = new CommitHistory(2);
    const scrollTop = commitRowHeight + 10;
    assert.strictEqual(listTop(rows, scrollTop, history, 1), undefined);
    history.add(0, [commitInfo('a'), commitInfo('b')]);
    assert.deepStrictEqual(listTop(rows, scrollTop, history, 1), {
      hash: 'a',
      offset: 10,
    });
  });

  test('is the working tree all the way up and within its row', () => {
    const history = new CommitHistory(2);
    const top = { hash: workingTreeHash, offset: 0 };
    assert.deepStrictEqual(listTop(rows, 0, history, 1), top);
    assert.deepStrictEqual(listTop(rows, 10, history, 1), top);
  });
});

suite('Commit list arrow keys', () => {
  test('step from the selected row, and stop at either end', () => {
    const history = new CommitHistory(2);
    history.add(0, [commitInfo('a'), commitInfo('b')]);
    assert.strictEqual(arrowKeyPosition(history, 'a', true, 1), 1);
    assert.strictEqual(arrowKeyPosition(history, 'a', true, -1), -1);
    assert.strictEqual(arrowKeyPosition(history, 'b', true, 1), undefined);
    assert.strictEqual(
      arrowKeyPosition(history, workingTreeHash, true, -1),
      undefined,
    );
    assert.strictEqual(arrowKeyPosition(history, 'a', false, -1), undefined);
    assert.strictEqual(arrowKeyPosition(history, undefined, true, 1), -1);
    assert.strictEqual(arrowKeyPosition(history, undefined, false, 1), 0);
  });

  test('step from where the extension said the selected commit is, before it loads', () => {
    const history = new CommitHistory(1000, [], undefined, 1, 5);
    history.add(900, [commitInfo('x')]);
    assert.strictEqual(arrowKeyPosition(history, 'c', true, 1), 6);
    assert.strictEqual(arrowKeyPosition(history, 'c', true, -1), 4);
  });

  test("don't start over from the top without knowing where the selected commit is", () => {
    const history = new CommitHistory(1000);
    history.add(900, [commitInfo('x')]);
    assert.strictEqual(arrowKeyPosition(history, 'c', true, 1), undefined);
    const moved = new CommitHistory(1000, [], undefined, 1, 0);
    moved.add(0, [commitInfo('d')]);
    assert.strictEqual(arrowKeyPosition(moved, 'c', true, 1), undefined);
  });

  test('step from a revealed commit before its page loads', () => {
    const history = new CommitHistory(1000);
    history.locate('c', 500);
    assert.strictEqual(arrowKeyPosition(history, 'c', true, 1), 501);
  });
});

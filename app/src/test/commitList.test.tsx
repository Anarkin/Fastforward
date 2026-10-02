import * as assert from 'node:assert';
import { isValidElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { comparisonOf } from '../shared/comparisons';
import { workingTreeHash, workingTreeIndex } from '../shared/protocol';
import { CommitHistory } from '../webview/commitHistory';
import {
  isListKey,
  keptPlace,
  settling,
  listKeyPosition,
  keySelection,
  pendingSelection,
  bubbleLineHeight,
  commitRowHeight,
  CommitBubbles,
  CommitRow,
  commitClass,
  estimatedRowHeight,
  fixedRowHeight,
  isCompareClick,
  listScroll,
  listTop,
  rowKeyOf,
  SoloButton,
  uncommittedChanges,
  WorkingTreeRow,
  workingTreeRowHeight,
  workingTreeShift,
} from '../webview/commitList';
import { formatDateTime } from '../webview/dates';
import { commitInfo, renderedBy } from './fixtures';

suite('Commit list rows', () => {
  test('starts a row with bubbles at one line of them', () => {
    const history = new CommitHistory(3, [[1, 2]]);
    assert.strictEqual(estimatedRowHeight(history, 0, 0), commitRowHeight);
    assert.strictEqual(
      estimatedRowHeight(history, 0, 1),
      commitRowHeight + bubbleLineHeight,
    );
    assert.strictEqual(estimatedRowHeight(history, 1, 0), workingTreeRowHeight);
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
    assert.strictEqual(rowKeyOf(history, 0, 2), 2);
  });

  test("keeps a commit not loaded yet at the height it is estimated at, so the list doesn't move when it loads", () => {
    const history = new CommitHistory(3);
    history.add(0, [commitInfo('a')]);
    assert.strictEqual(fixedRowHeight(history, 1, 0, 30), undefined);
    assert.strictEqual(fixedRowHeight(history, 1, 1, 30), undefined);
    assert.strictEqual(fixedRowHeight(history, 1, 2, 30), 30);
    assert.strictEqual(fixedRowHeight(undefined, 0, 0, 30), 30);
  });

  test("puts a commit's bubbles on one line that can break between them", () => {
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
      /^<div class="bubble-line"><span class="badge head[^>]*>HEAD aaaaaaa<\/span><wbr\/><span class="badge branch[^>]*>main<\/span><wbr\/><span class="badge remote[^>]*>origin\/main<\/span><\/div>$/,
    );
  });

  test('marks a detached HEAD on a commit without refs', () => {
    assert.match(
      renderToStaticMarkup(
        <CommitBubbles hash={'a'.repeat(40)} refs={[]} detached />,
      ),
      /^<div class="bubble-line"><span class="badge head[^>]*>HEAD aaaaaaa<\/span><\/div>$/,
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

const noop = () => {};

const plainClick = {
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  altKey: false,
};

function clickedHash(
  count: number,
  click = plainClick,
): { selected?: string; compared?: string } {
  const clicked: { selected?: string; compared?: string } = {};
  const row = WorkingTreeRow({
    count,
    selection: undefined,
    indent: 26,
    onSelect: (hash) => (clicked.selected = hash),
    onCompare: (hash) => (clicked.compared = hash),
  });
  assert.ok(isValidElement<{ onClick: (event: typeof click) => void }>(row));
  row.props.onClick(click);
  return clicked;
}

function workingTreeHtml(selection: string): string {
  return renderToStaticMarkup(
    <WorkingTreeRow
      count={1}
      selection={selection}
      indent={0}
      onSelect={noop}
    />,
  );
}

suite('Commit list working tree row', () => {
  test('shows a clean working tree, which clicking selects, as the keys do', () => {
    const html = renderToStaticMarkup(
      <WorkingTreeRow
        count={0}
        selection={undefined}
        indent={26}
        onSelect={noop}
      />,
    );
    assert.match(
      html,
      /^<div [^>]*class="commit working-tree empty\s*"><div class="commit-line"><span class="subject">No uncommitted changes<\/span><\/div><\/div>$/,
    );
    assert.deepStrictEqual(clickedHash(0), { selected: workingTreeHash });
  });

  test('shows how many files changed, and clicking selects them', () => {
    const html = renderToStaticMarkup(
      <WorkingTreeRow
        count={3}
        selection={undefined}
        indent={26}
        onSelect={noop}
      />,
    );
    assert.doesNotMatch(html, /empty/);
    assert.match(
      html,
      /<div class="commit-line"><span class="subject">3 uncommitted changes<\/span><\/div><\/div>$/,
    );
    assert.strictEqual(uncommittedChanges(1), '1 uncommitted change');
    assert.deepStrictEqual(clickedHash(3), { selected: workingTreeHash });
  });

  test('compares with the working tree when clicked with Ctrl, or Cmd', () => {
    assert.deepStrictEqual(clickedHash(3, { ...plainClick, ctrlKey: true }), {
      compared: workingTreeHash,
    });
    assert.deepStrictEqual(clickedHash(0, { ...plainClick, metaKey: true }), {
      compared: workingTreeHash,
    });
  });

  test('shows the working tree selected as either side of a comparison', () => {
    assert.match(
      workingTreeHtml(comparisonOf(workingTreeHash, 'a')),
      /class="commit working-tree\s+selected compare-from"/,
    );
    assert.match(
      workingTreeHtml(comparisonOf('a', workingTreeHash)),
      /class="commit working-tree\s+selected"/,
    );
  });

  test('keeps a scrolled list in place when the working tree row appears above it', () => {
    assert.strictEqual(workingTreeShift(500, 0, 1, workingTreeRowHeight), 530);
    assert.strictEqual(
      workingTreeShift(0, 0, 1, workingTreeRowHeight),
      undefined,
    );
    assert.strictEqual(
      workingTreeShift(500, 1, 1, workingTreeRowHeight),
      undefined,
    );
  });

  test('keeps its place by what was scrolled since the place it last told', () => {
    assert.strictEqual(keptPlace(1000, 7, 400, 400).top, 1007);
    assert.strictEqual(keptPlace(1000, 7, 900, 400).top, 1507);
    assert.strictEqual(keptPlace(1000, 7, 900, undefined).top, 1007);
  });

  test('keeps its place only once when another history comes before its own scroll is told', () => {
    const first = keptPlace(1000, 7, 900, 400);
    assert.strictEqual(
      keptPlace(1300, 7, first.top, first.reportedTop).top,
      1807,
    );
    const unscrolled = keptPlace(1000, 7, 0, undefined);
    assert.strictEqual(
      keptPlace(1300, 7, unscrolled.top, unscrolled.reportedTop).top,
      1307,
    );
  });

  test('shifts the list rather than scrolling to its target again when only the working tree row comes or goes', () => {
    const target = { index: 3 };
    assert.deepStrictEqual(
      listScroll({ target, offset: 0 }, { target, offset: 1 }),
      { shiftBy: 1 },
    );
  });

  test('scrolls to a new target without shifting, even when the working tree row appears with it', () => {
    const target = { index: 3 };
    assert.deepStrictEqual(
      listScroll({ target: { index: 3 }, offset: 0 }, { target, offset: 1 }),
      { target },
    );
  });

  test('leaves the list alone when neither its target nor the working tree row changes', () => {
    const target = { index: 3 };
    assert.strictEqual(
      listScroll({ target, offset: 1 }, { target, offset: 1 }),
      undefined,
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

  test('is the row a scroll ends exactly at, a first commit without a working tree, and nothing past the rows', () => {
    const history = new CommitHistory(3);
    history.add(0, [commitInfo('a'), commitInfo('b'), commitInfo('c')]);
    assert.deepStrictEqual(listTop(rows, commitRowHeight, history, 1), {
      hash: 'a',
      offset: 0,
    });
    assert.deepStrictEqual(listTop(rows, 10, history, 0), {
      hash: 'a',
      offset: 10,
    });
    assert.strictEqual(
      listTop(rows, 3 * commitRowHeight + 1, history, 0),
      undefined,
    );
  });
});

const loaded = (...hashes: string[]) => {
  const history = new CommitHistory(hashes.length);
  history.add(
    0,
    hashes.map((hash) => commitInfo(hash)),
  );
  return history;
};

const settled = () => new Promise((resolve) => setTimeout(resolve, 30));

suite('Commit list keys', () => {
  test('sends a selection made by a held key only once the key settles', async () => {
    const sent: string[] = [];
    const { settle } = settling((hash: string) => sent.push(hash), 10);
    settle('a', false);
    settle('b', true);
    settle('c', true);
    assert.deepStrictEqual(sent, ['a']);
    await settled();
    assert.deepStrictEqual(sent, ['a', 'c']);
    settle('d', true);
    settle('e', false);
    await settled();
    assert.deepStrictEqual(sent, ['a', 'c', 'e']);
  });

  test('sends a selection made by a held key at once before anything sent after it, and only once', async () => {
    const sent: string[] = [];
    const { settle, send } = settling(
      (message: string) => sent.push(message),
      10,
    );
    settle('select b', true);
    send('switch tab');
    send('load tree');
    assert.deepStrictEqual(sent, ['select b', 'switch tab', 'load tree']);
    await settled();
    assert.deepStrictEqual(sent, ['select b', 'switch tab', 'load tree']);
  });

  test('holds what follows a selection made by a held key with it, dropping it when the key moves on', async () => {
    const sent: string[] = [];
    const { settle, follow } = settling(
      (message: string) => sent.push(message),
      10,
    );
    settle('select b', true);
    follow('load tree b');
    settle('select c', true);
    follow('load tree c');
    assert.deepStrictEqual(sent, []);
    await settled();
    assert.deepStrictEqual(sent, ['select c', 'load tree c']);
    settle('select d', false);
    follow('load tree d');
    assert.deepStrictEqual(sent, [
      'select c',
      'load tree c',
      'select d',
      'load tree d',
    ]);
  });

  const visible = { first: 0, last: 0 };
  const press = (
    key: string,
    history: CommitHistory,
    selected: string | undefined,
    workingTree: boolean,
    rows = visible,
    headCommit?: string,
    pending?: number,
  ) =>
    listKeyPosition(
      key,
      history,
      selected,
      workingTree,
      rows,
      headCommit,
      pending,
    );

  test('steps with the arrows from the selected row, and stops at either end', () => {
    const history = loaded('a', 'b');
    assert.strictEqual(press('ArrowDown', history, 'a', true), 1);
    assert.strictEqual(press('ArrowUp', history, 'a', true), -1);
    assert.strictEqual(press('ArrowDown', history, 'b', true), undefined);
    assert.strictEqual(
      press('ArrowUp', history, workingTreeHash, true),
      undefined,
    );
    assert.strictEqual(press('ArrowUp', history, 'a', false), undefined);
    assert.strictEqual(press('ArrowDown', history, workingTreeHash, true), 0);
  });

  test('starts from the checked-out commit when nothing is selected, or else from the top', () => {
    const history = loaded('a', 'b', 'c');
    assert.strictEqual(
      press('ArrowDown', history, undefined, true, visible, 'b'),
      1,
    );
    assert.strictEqual(
      press('ArrowUp', history, undefined, true, visible, 'b'),
      1,
    );
    assert.strictEqual(press('ArrowDown', history, undefined, true), -1);
    assert.strictEqual(press('ArrowDown', history, undefined, false), 0);
  });

  test('steps with the arrows from the commit compared to', () => {
    const history = loaded('a', 'b', 'c');
    assert.strictEqual(
      press('ArrowDown', history, comparisonOf('c', 'a'), true),
      1,
    );
    assert.strictEqual(
      press('ArrowUp', history, comparisonOf('a', workingTreeHash), true),
      undefined,
    );
    assert.strictEqual(
      press('ArrowDown', history, comparisonOf('a', workingTreeHash), true),
      0,
    );
  });

  test('goes to the first row on Home and the last on End, loaded or not', () => {
    const history = new CommitHistory(1000);
    history.add(0, [commitInfo('a'), commitInfo('b')]);
    assert.strictEqual(press('Home', history, 'b', true), -1);
    assert.strictEqual(press('Home', history, 'b', false), 0);
    assert.strictEqual(press('End', history, 'a', true), 999);
    assert.strictEqual(press('End', history, undefined, false), 999);
  });

  test('pages down to the last row in view first, then a screen further, and up likewise', () => {
    const history = new CommitHistory(100);
    history.add(
      0,
      Array.from({ length: 30 }, (_, index) => commitInfo(`c${index}`)),
    );
    const rows = { first: 10, last: 19 };
    assert.strictEqual(press('PageDown', history, 'c12', false, rows), 19);
    assert.strictEqual(press('PageDown', history, 'c19', false, rows), 28);
    assert.strictEqual(press('PageDown', history, undefined, false, rows), 19);
    assert.strictEqual(press('PageUp', history, 'c15', false, rows), 10);
    assert.strictEqual(press('PageUp', history, 'c10', false, rows), 1);
    assert.strictEqual(
      press('PageUp', history, 'c3', false, { first: 3, last: 12 }),
      0,
    );
    assert.strictEqual(
      press('PageDown', history, 'c0', false, { first: 95, last: 99 }),
      99,
    );
  });

  test('keeps going from a row still loading, rather than the selected one', () => {
    const history = new CommitHistory(1000);
    history.add(0, [commitInfo('a')]);
    assert.strictEqual(
      press('ArrowUp', history, 'a', false, visible, undefined, 999),
      998,
    );
  });

  test('steps from where the extension said the selected commit is, before it loads', () => {
    const history = new CommitHistory(1000, [], undefined, 1, 5);
    history.add(900, [commitInfo('x')]);
    assert.strictEqual(press('ArrowDown', history, 'c', true), 6);
    assert.strictEqual(press('ArrowUp', history, 'c', true), 4);
  });

  test("doesn't start over from the top without knowing where the selected commit is", () => {
    const history = new CommitHistory(1000);
    history.add(900, [commitInfo('x')]);
    assert.strictEqual(press('ArrowDown', history, 'c', true), undefined);
    const moved = new CommitHistory(1000, [], undefined, 1, 0);
    moved.add(0, [commitInfo('d')]);
    assert.strictEqual(press('End', moved, 'c', true), undefined);
  });

  test('goes on from the merge the selected commit is hidden in', () => {
    const history = new CommitHistory(3, [], undefined, 0, undefined, 0);
    history.add(0, [commitInfo('m'), commitInfo('n'), commitInfo('o')]);
    assert.strictEqual(press('ArrowDown', history, 'hidden', false), 1);
    assert.strictEqual(press('End', history, 'hidden', false), 2);
  });

  test('steps from a revealed commit before its page loads', () => {
    const history = new CommitHistory(1000);
    history.locate('c', 500);
    assert.strictEqual(press('ArrowDown', history, 'c', true), 501);
  });

  test('selects a row a key went to once it loads, but not in a history laid out anew meanwhile', () => {
    const history = new CommitHistory(10);
    const pending = { history, position: 9 };
    assert.strictEqual(pendingSelection(pending, history, 'a'), null);
    history.add(9, [commitInfo('last')]);
    assert.strictEqual(pendingSelection(pending, history, 'a'), 'last');
    assert.strictEqual(
      pendingSelection(
        pending,
        loaded(...Array.from({ length: 12 }, (_, i) => `c${i}`)),
        'a',
      ),
      null,
    );
  });

  test('keeps the selected commit selected when a key comes back to it from a row still loading', () => {
    const history = new CommitHistory(10);
    history.add(0, [commitInfo('a'), commitInfo('b')]);
    assert.strictEqual(keySelection(history, 2, 'b'), null);
    assert.strictEqual(keySelection(history, 1, 'b'), undefined);
    assert.strictEqual(keySelection(history, 0, 'b'), 'a');
    assert.strictEqual(
      keySelection(history, workingTreeIndex, workingTreeHash),
      undefined,
    );
    assert.strictEqual(
      keySelection(history, workingTreeIndex, 'a'),
      workingTreeHash,
    );
    history.add(9, [commitInfo('last')]);
    assert.strictEqual(
      pendingSelection({ history, position: 9 }, history, 'last'),
      undefined,
    );
  });

  test('takes only the list keys without modifiers', () => {
    const key = {
      key: 'End',
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      shiftKey: false,
    };
    assert.ok(isListKey(key));
    assert.ok(isListKey({ ...key, key: 'PageUp' }));
    assert.ok(!isListKey({ ...key, ctrlKey: true }));
    assert.ok(!isListKey({ ...key, shiftKey: true }));
    assert.ok(!isListKey({ ...key, key: 'Enter' }));
  });
});

suite('Solo button', () => {
  test('spins its icon and takes no clicks while the history reloads', () => {
    const idle = renderToStaticMarkup(
      <SoloButton solo applying={false} onSolo={noop} />,
    );
    assert.match(idle, /class="nav-button toggle active\s*"/);
    assert.doesNotMatch(idle, /disabled/);
    const applying = renderToStaticMarkup(
      <SoloButton solo applying onSolo={noop} />,
    );
    assert.match(applying, /class="nav-button toggle active running"/);
    assert.match(applying, /disabled=""/);
    assert.match(applying, /<span class="spin-icon"><svg/);
  });
});

suite('Commit rows', () => {
  test('marks the checked-out commit, whether or not it is selected', () => {
    assert.strictEqual(commitClass('a', undefined, 'a'), 'commit checked-out');
    assert.strictEqual(
      commitClass('a', 'a', 'a'),
      'commit selected checked-out',
    );
    assert.strictEqual(commitClass('b', 'b', 'a'), 'commit selected');
    assert.strictEqual(commitClass('b', undefined, undefined), 'commit');
  });

  test('marks both commits of a comparison selected, and the one compared from', () => {
    const selection = comparisonOf('a', 'b');
    assert.strictEqual(
      commitClass('a', selection, undefined),
      'commit selected compare-from',
    );
    assert.strictEqual(
      commitClass('b', selection, undefined),
      'commit selected',
    );
    assert.strictEqual(commitClass('c', selection, undefined), 'commit');
  });

  test('compares only on a click with Ctrl, or Cmd, alone', () => {
    assert.ok(isCompareClick({ ...plainClick, ctrlKey: true }));
    assert.ok(isCompareClick({ ...plainClick, metaKey: true }));
    assert.ok(!isCompareClick(plainClick));
    assert.ok(
      !isCompareClick({ ...plainClick, ctrlKey: true, shiftKey: true }),
    );
    assert.ok(!isCompareClick({ ...plainClick, metaKey: true, altKey: true }));
  });
});

suite('Commit row', () => {
  test('shows the subject, author, the date it was last committed and bubbles, but no file count', () => {
    let picked: string | undefined;
    const props = {
      commit: commitInfo('a', {
        subject: 'Fix it',
        authorName: 'Ann',
        commitDate: Date.UTC(2026, 8, 30, 11, 56),
      }),
      selected: undefined,
      headCommit: 'a',
      refs: [{ kind: 'branch' as const, name: 'main', commit: 'a' }],
      detached: false,
      indent: 26,
      onSelect: (hash: string) => (picked = hash),
    };
    const html = renderToStaticMarkup(<CommitRow {...props} />);
    assert.match(
      html,
      /^<div class="commit checked-out" style="padding-left:26px">/,
    );
    assert.match(html, /<span class="subject">Fix it<\/span><\/div>/);
    assert.match(html, /<span class="author">Ann<\/span>/);
    assert.ok(
      html.includes(
        `<span class="date">${formatDateTime(props.commit.commitDate)}</span>`,
      ),
    );
    assert.match(html, />main</);
    assert.doesNotMatch(html, /class="count"/);
    const row = renderedBy(CommitRow, props);
    assert.ok(
      isValidElement<{ onClick: (event: typeof plainClick) => void }>(row),
    );
    row.props.onClick(plainClick);
    assert.strictEqual(picked, 'a');
  });

  test('compares with the commit when clicked with Ctrl', () => {
    const picked: string[] = [];
    const compared: string[] = [];
    const row = renderedBy(CommitRow, {
      commit: commitInfo('a'),
      selected: 'b',
      headCommit: undefined,
      refs: [],
      detached: false,
      indent: 0,
      onSelect: (hash: string) => picked.push(hash),
      onCompare: (hash: string) => compared.push(hash),
    });
    assert.ok(
      isValidElement<{ onClick: (event: typeof plainClick) => void }>(row),
    );
    row.props.onClick({ ...plainClick, ctrlKey: true });
    assert.deepStrictEqual([picked, compared], [[], ['a']]);
  });
});

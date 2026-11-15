import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { isValidElement } from 'react';
import { comparisonOf } from '../../../../../tools/git/shared/comparisons';
import {
  workingTreeHash,
  type GraphLine,
  type GraphRow,
  type RefInfo,
} from '../../../../../tools/git/shared/protocol';
import { GitStore } from '../../../../../tools/git/page/store';
import { gitStore, type ShownGit } from '../../../../helpers/componentFixtures';
import { withMacKeys } from '../../../../helpers/fixtures';
import { renderToStaticMarkup, noop, plainClick } from './commitListFixtures';
import {
  keyboardMenuTarget,
  withoutWorkingTreeLink,
} from '../../../../../tools/git/page/commitListKeys';
import { workingTreeRowHeight } from '../../../../../tools/git/page/commitListRows';
import {
  CommitBubbles,
  WorkingTreeRow,
} from '../../../../../tools/git/page/commitList';
import {
  listScroll,
  workingTreeShift,
} from '../../../../../tools/git/page/commitListScrolling';

const tracking = { upstream: 'origin/main', ahead: 0, behind: 0 };

function bubblesOf(hash: string, shown: ShownGit = {}): string {
  return renderToStaticMarkup(
    <GitStore value={gitStore(shown)}>
      <CommitBubbles hash={hash} />
    </GitStore>,
  );
}

suite('Commit list rows', () => {
  test("puts a commit's bubbles on one line that can break between them", () => {
    const html = bubblesOf('a'.repeat(40), {
      hideDimmed: true,
      headCommit: 'a'.repeat(40),
      refs: [
        { kind: 'branch', name: 'main', commit: 'a'.repeat(40), tracking },
        { kind: 'remote', name: 'origin/main', commit: 'a'.repeat(40) },
      ],
    });
    assert.strictEqual(html.match(/class="bubble-line"/g)?.length, 1);
    assert.match(
      html,
      /^<div class="bubble-line"><span class="badge head[^>]*>HEAD aaaaaaa<\/span><wbr\/><span class="badge branch[^>]*>main<\/span><wbr\/><span class="badge remote[^>]*>origin\/main<\/span><\/div>$/,
    );
  });

  test("offers pull and push on the checked-out branch's bubble in a commit's row", () => {
    const html = bubblesOf('a'.repeat(40), {
      head: 'main',
      refs: [{ kind: 'branch', name: 'main', commit: 'a'.repeat(40) }],
    });
    assert.match(html, /class="bubble-action[^"]*" title="Pull:/);
    assert.match(html, /class="bubble-action[^"]*" title="Push:/);
  });

  test("puts each remote's tag right after the local tag of its name, and the tags only on a remote after the rest", () => {
    const at = 'a'.repeat(40);
    const html = bubblesOf(at, {
      hideDimmed: true,
      refs: [
        { kind: 'branch', name: 'main', commit: at, tracking },
        { kind: 'tag', name: 'v1', commit: at },
        { kind: 'tag', name: 'v2', commit: at },
        {
          kind: 'remote-tag',
          name: 'origin/v1',
          commit: at,
          remote: 'origin',
        },
        {
          kind: 'remote-tag',
          name: 'origin/v3',
          commit: at,
          remote: 'origin',
        },
        {
          kind: 'remote-tag',
          name: 'second/v1',
          commit: at,
          remote: 'second',
        },
      ],
    });
    assert.deepStrictEqual(
      [...html.matchAll(/class="badge [^"]*"[^>]*>([^<]+)</g)].map(
        ([, name]) => name,
      ),
      ['main', 'v1', 'origin/v1', 'second/v1', 'v2', 'origin/v3'],
    );
  });

  test('offers pull and push on the bubble of a branch that is not checked out, with the counts of that branch', () => {
    const html = bubblesOf('a'.repeat(40), {
      head: 'main',
      refs: [
        {
          kind: 'branch',
          name: 'side',
          commit: 'a'.repeat(40),
          tracking: { upstream: 'origin/side', ahead: 3, behind: 0 },
        },
      ],
    });
    assert.match(
      html,
      /title="Push:[^"]*"[^>]*><svg.*?<\/svg><span class="bubble-count">3<\/span>/,
    );
  });

  test('marks a detached HEAD on a commit without refs', () => {
    assert.match(
      bubblesOf('a'.repeat(40), { headCommit: 'a'.repeat(40) }),
      /^<div class="bubble-line"><span class="badge head[^>]*>HEAD aaaaaaa<\/span><\/div>$/,
    );
  });

  test("marks a bookmarked commit with its hash after its refs and before the stash, as the search's bookmarks show it", () => {
    const at = 'a'.repeat(40);
    const bubbles = (refs: RefInfo[], stash: boolean) =>
      bubblesOf(at, {
        bookmarks: [{ kind: 'commit', name: at }],
        hideDimmed: true,
        refs,
        stashes: stash ? [{ name: 'stash@{0}', commit: at, message: '' }] : [],
      });
    assert.match(
      bubbles([{ kind: 'branch', name: 'main', commit: at, tracking }], true),
      /^<div class="bubble-line"><span class="badge branch[^>]*>main<\/span><wbr\/><span class="badge hash" title="[^"]*aaaaaaaaaa[^"]*">aaaaaaa<\/span><wbr\/><span class="badge stash">[^<]*<\/span><\/div>$/,
    );
    assert.match(
      bubbles([], false),
      /^<div class="bubble-line"><span class="badge hash"[^>]*>aaaaaaa<\/span><\/div>$/,
    );
  });

  test('leaves the hash of a bookmarked commit to its HEAD bubble when HEAD is detached at it', () => {
    const at = 'a'.repeat(40);
    assert.match(
      bubblesOf(at, {
        bookmarks: [{ kind: 'commit', name: at }],
        headCommit: at,
      }),
      /^<div class="bubble-line"><span class="badge head[^>]*>HEAD aaaaaaa<\/span><\/div>$/,
    );
  });

  test('marks no commit bookmarked but the ones bookmarked', () => {
    assert.strictEqual(
      bubblesOf('a'.repeat(40), {
        bookmarks: [{ kind: 'commit', name: 'b'.repeat(40) }],
      }),
      '',
    );
  });

  test('draws no bubble line for a commit without refs', () => {
    assert.strictEqual(bubblesOf('a'.repeat(40)), '');
  });
});

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

suite('Commit list menu from the keyboard', () => {
  test('opens the menu of the selected commit on the menu key, as rows open theirs on a right click, but none for the working tree or a stash', () => {
    const stashes = new Set(['s']);
    assert.deepStrictEqual(keyboardMenuTarget('a', stashes), {
      kind: 'commit',
      hash: 'a',
    });
    assert.deepStrictEqual(
      keyboardMenuTarget(comparisonOf('a', 'b'), stashes),
      {
        kind: 'commit',
        hash: 'b',
      },
    );
    assert.strictEqual(keyboardMenuTarget(workingTreeHash, stashes), undefined);
    assert.strictEqual(keyboardMenuTarget('s', stashes), undefined);
    assert.strictEqual(keyboardMenuTarget(undefined, stashes), undefined);
  });
});

const graphRow = (lane: number, ...lines: GraphLine[]): GraphRow => ({
  lane,
  color: 1,
  lines,
});

suite('Commit list without its working tree row', () => {
  test('draws no dashed line from the working tree down into the checked-out commit while the list has no working tree row, keeping the dashed lines of stashes below it', () => {
    const link = { from: 0, to: 0, color: 0, bottom: false, dashed: true };
    const own = { from: 1, to: 1, color: 1, bottom: true };
    assert.deepStrictEqual(
      withoutWorkingTreeLink(graphRow(1, link, own), 0, 2),
      graphRow(1, own),
    );
    assert.deepStrictEqual(
      withoutWorkingTreeLink(graphRow(1, { ...link, to: 1 }, own), 2, 2),
      graphRow(1, own),
    );
    assert.deepStrictEqual(
      withoutWorkingTreeLink(graphRow(0, link, own), 3, 2),
      graphRow(0, link, own),
    );
    assert.deepStrictEqual(
      withoutWorkingTreeLink(graphRow(1, link), 5, undefined),
      graphRow(1),
    );
  });
});

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
    assert.match(
      renderToStaticMarkup(
        <WorkingTreeRow
          count={1}
          selection={undefined}
          indent={26}
          onSelect={noop}
        />,
      ),
      /<span class="subject">1 uncommitted change<\/span>/,
    );
    assert.deepStrictEqual(clickedHash(3), { selected: workingTreeHash });
  });

  test('compares with the working tree when clicked with Ctrl, or Cmd on macOS', () => {
    assert.deepStrictEqual(clickedHash(3, { ...plainClick, ctrlKey: true }), {
      compared: workingTreeHash,
    });
    assert.deepStrictEqual(
      withMacKeys(() => clickedHash(0, { ...plainClick, metaKey: true })),
      { compared: workingTreeHash },
    );
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
    assert.strictEqual(
      workingTreeShift(500, 1, workingTreeRowHeight),
      500 + workingTreeRowHeight,
    );
    assert.strictEqual(
      workingTreeShift(500 + workingTreeRowHeight, -1, workingTreeRowHeight),
      500,
    );
    assert.strictEqual(workingTreeShift(0, 1, workingTreeRowHeight), undefined);
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

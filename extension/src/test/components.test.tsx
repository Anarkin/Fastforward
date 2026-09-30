import * as assert from 'node:assert';
import { isValidElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { changesTreeElements, changesTreeRows } from '../webview/changesTree';
import { MenuItems } from '../webview/contextMenu';
import { leafIndent, LocationsPopup } from '../webview/locations';
import {
  historyButtonClick,
  HistoryMenu,
  holdsDismissLayer,
  MessagePeek,
  NavBar,
  NavButtons,
  nextPeekMode,
} from '../webview/navBar';
import { changeTitle, statusClass } from '../webview/fileStatus';
import { LineCounts } from '../webview/lineCounts';
import { SkeletonRows } from '../webview/skeleton';
import { TabBar } from '../webview/tabBar';
import { GraphCell } from '../webview/graph';
import {
  cardCommit,
  classesOf,
  definitions,
  fileChange as change,
  tagsWith,
} from './fixtures';
import type { RefInfo, RepositoryState } from '../shared/protocol';

const noop = () => {};

function renderedBy<P>(
  component: (props: P) => React.ReactNode,
  props: P,
): React.ReactNode {
  let rendered: React.ReactNode;
  function Probe() {
    rendered = component(props);
    return null;
  }
  renderToStaticMarkup(<Probe />);
  return rendered;
}

function tagWith(html: string, text: string, ...classes: string[]): string {
  const found = tagsWith(html, ...classes).filter((tag) => tag.includes(text));
  assert.strictEqual(found.length, 1, `${classes.join(' ')} with ${text}`);
  return found[0];
}

suite('File status', () => {
  test('names the status and both paths of a rename in the tooltip', () => {
    assert.strictEqual(
      changeTitle(change('new.ts', { status: 'R', oldPath: 'old.ts' })),
      'Renamed: old.ts → new.ts',
    );
    assert.strictEqual(
      changeTitle(change('gone.ts', { status: 'D' })),
      'Deleted: gone.ts',
    );
    assert.strictEqual(statusClass(change('a.ts')), 'path status-M');
  });
});

suite('Line counts', () => {
  test('shows deletions before insertions', () => {
    assert.strictEqual(
      renderToStaticMarkup(<LineCounts deletions={2} insertions={3} />),
      '<span class="line-counts"><span class="deletions">-2</span><span class="insertions">+3</span></span>',
    );
  });

  test('leaves out a side without lines, and shows nothing without any', () => {
    assert.strictEqual(
      renderToStaticMarkup(<LineCounts deletions={2} insertions={0} />),
      '<span class="line-counts"><span class="deletions">-2</span></span>',
    );
    assert.strictEqual(
      renderToStaticMarkup(<LineCounts deletions={0} insertions={3} />),
      '<span class="line-counts"><span class="insertions">+3</span></span>',
    );
    assert.strictEqual(
      renderToStaticMarkup(<LineCounts deletions={0} insertions={0} />),
      '',
    );
  });
});

suite('Changes tree rows', () => {
  test('draws folders and files, marking the selected file', () => {
    const files = [change('src/a.ts'), change('src/b.ts')];
    const html = renderToStaticMarkup(
      <>
        {changesTreeElements({
          rows: changesTreeRows(files, new Set()),
          onToggle: noop,
          selected: 'src/b.ts',
          onSelect: noop,
        })}
      </>,
    );
    tagWith(html, 'title="src"', 'row', 'tree-row', 'folder', 'counted');
    tagWith(html, 'title="Modified: src/b.ts"', 'row', 'file', 'selected');
    const a = tagWith(html, 'title="Modified: src/a.ts"', 'row', 'file');
    assert.ok(!classesOf(a).has('selected'));
  });
});

const bar = (props: Partial<Parameters<typeof NavBar>[0]>) =>
  renderToStaticMarkup(
    <NavBar
      root="/repo"
      address={{ hash: undefined, subject: undefined, commit: undefined }}
      repository={undefined}
      selected={undefined}
      hashLookup={undefined}
      onLookupHash={noop}
      onJump={noop}
      {...props}
    />,
  );

const buttons = (props: Partial<Parameters<typeof NavButtons>[0]>) =>
  renderToStaticMarkup(
    <NavButtons
      back={[]}
      forward={[]}
      onNavigate={noop}
      fetching={false}
      onFetch={noop}
      {...props}
    />,
  );

const peek = (commit: Parameters<typeof cardCommit>[0]) =>
  renderToStaticMarkup(
    <MessagePeek commit={cardCommit(commit)} onOpen={noop} />,
  );

suite('Navigation bar', () => {
  test('greys out back and forward without steps', () => {
    const html = buttons({
      back: [{ hash: 'a'.repeat(40), subject: 'a' }],
    });
    assert.match(html, /title="Back[^"]*"(?![^>]*disabled)/);
    assert.match(html, /title="Forward[^"]*" disabled=""/);
  });

  test('shows the selected commit like an address, hash and subject on one line of text', () => {
    const html = bar({
      address: {
        hash: 'd1f0050454a27f025c6820fc4a42b101a7fa356a',
        subject: 'chore: trim verification',
        commit: undefined,
      },
    });
    assert.strictEqual(tagsWith(html, 'address-text').length, 1);
    assert.match(
      html,
      /class="address-hash">d1f0050<\/span>chore: trim verification<\/span>/,
    );
  });

  test('peeks at the description and details, the bar keeping its text', () => {
    const hash = 'd1f0050454a27f025c6820fc4a42b101a7fa356a';
    const html = peek({
      hash,
      subject: 'the subject',
      message: 'the subject\n\nthe body\nmore',
      authorName: 'Jozsef Simon',
      authorEmail: 'jozsef@example.com',
      authorDate: new Date(2022, 11, 14, 16, 12).getTime(),
      committerName: 'Jozsef Simon',
      committerEmail: 'jozsef@example.com',
      commitDate: new Date(2022, 11, 14, 16, 12, 30).getTime(),
    });
    assert.strictEqual(tagsWith(html, 'locations-popup', 'peek').length, 1);
    assert.match(html, /class="address-hash">d1f0050<\/span>the subject</);
    assert.match(html, /class="commit-card-body">the body\nmore<\/pre>/);
    assert.deepStrictEqual(definitions(html), [
      ['Commit', hash, 'commit-card-hash'],
      ['Author', 'Jozsef Simon <jozsef@example.com>', ''],
      ['Committer', 'same', 'same'],
      ['Authored', '2022-12-14 16:12', ''],
      ['Committed', 'same', 'same'],
    ]);
    assert.doesNotMatch(html, /<input/);
  });

  test('peeks at the details of a commit without a description', () => {
    const html = peek({ message: 'only' });
    assert.strictEqual(tagsWith(html, 'commit-card-frame', 'empty').length, 1);
    assert.strictEqual(tagsWith(html, 'commit-card-body').length, 0);
    assert.deepStrictEqual(definitions(html)[1], [
      'Author',
      'A <a@example.com>',
      '',
    ]);
  });

  test('shows the committer and when committed where they differ', () => {
    const html = peek({
      message: 'rebased',
      authorName: 'Ann',
      authorEmail: 'ann@example.com',
      authorDate: new Date(2022, 11, 14, 16, 12).getTime(),
      committerName: 'Bob',
      committerEmail: 'bob@example.com',
      commitDate: new Date(2022, 11, 20, 9, 5).getTime(),
    });
    assert.deepStrictEqual(definitions(html).slice(1), [
      ['Author', 'Ann <ann@example.com>', ''],
      ['Committer', 'Bob <bob@example.com>', ''],
      ['Authored', '2022-12-14 16:12', ''],
      ['Committed', '2022-12-20 09:05', ''],
    ]);
  });

  test("lists the commit's bubbles one to a row, without labels", () => {
    const hash = 'a'.repeat(40);
    const html = peek({
      hash,
      message: 'tagged',
      refs: [
        { kind: 'branch', name: 'main', commit: hash },
        { kind: 'tag', name: 'v1.0', commit: hash },
      ],
      detachedHead: true,
    });
    assert.deepStrictEqual(definitions(html).slice(-3), [
      ['', 'HEAD aaaaaaa', 'first-bubble'],
      ['', 'main', ''],
      ['', 'v1.0', ''],
    ]);
    tagWith(html, '', 'badge', 'head');
    tagWith(html, '', 'badge', 'branch');
    tagWith(html, '', 'badge', 'tag');
  });

  test('spins the fetch button while fetching', () => {
    const spinning = tagWith(
      buttons({ fetching: true }),
      'title="Fetch',
      'nav-button',
      'running',
    );
    assert.match(spinning, /disabled=""/);
    const idle = tagWith(buttons({}), 'title="Fetch', 'nav-button');
    assert.ok(!classesOf(idle).has('running'));
  });
});

suite('Peek', () => {
  test('peeks when the pointer rests, and closes a peek when it leaves', () => {
    assert.strictEqual(nextPeekMode('closed', 'rest', true), 'peek');
    assert.strictEqual(nextPeekMode('closed', 'rest', false), 'closed');
    assert.strictEqual(nextPeekMode('peek', 'leave', true), 'closed');
    assert.strictEqual(nextPeekMode('open', 'rest', true), 'open');
    assert.strictEqual(nextPeekMode('open', 'leave', true), 'open');
  });

  test('toggles a peek from the keyboard, but not what a click opened', () => {
    assert.strictEqual(nextPeekMode('closed', 'toggle', true), 'pinned');
    assert.strictEqual(nextPeekMode('closed', 'toggle', false), 'closed');
    assert.strictEqual(nextPeekMode('pinned', 'toggle', true), 'closed');
    assert.strictEqual(nextPeekMode('peek', 'toggle', true), 'closed');
    assert.strictEqual(nextPeekMode('open', 'toggle', true), 'open');
  });

  test('keeps a peek from the keyboard when the pointer leaves', () => {
    assert.strictEqual(nextPeekMode('pinned', 'leave', true), 'pinned');
    assert.strictEqual(nextPeekMode('pinned', 'rest', true), 'pinned');
  });

  test('closes a peek when what it peeks at goes away', () => {
    assert.strictEqual(nextPeekMode('peek', 'update', false), 'closed');
    assert.strictEqual(nextPeekMode('pinned', 'update', false), 'closed');
    assert.strictEqual(nextPeekMode('pinned', 'update', true), 'pinned');
    assert.strictEqual(nextPeekMode('open', 'update', false), 'open');
  });

  test('leaves Escape to what is open when only peeking', () => {
    assert.strictEqual(holdsDismissLayer('peek'), false);
    assert.strictEqual(holdsDismissLayer('open'), true);
  });
});

suite('History buttons', () => {
  test('go a step on a click, but not on the one ending a hold', () => {
    assert.strictEqual(historyButtonClick(false, false), 'step');
    assert.strictEqual(historyButtonClick(true, true), 'none');
  });

  test('close their open history on a click instead of going a step', () => {
    assert.strictEqual(historyButtonClick(false, true), 'close');
  });

  test('keys history entries apart that are the same commit', () => {
    const a = 'a'.repeat(40);
    const menu = renderedBy(HistoryMenu, {
      container: { current: null },
      entries: [
        { hash: a, subject: 'a' },
        { hash: 'b'.repeat(40), subject: 'b' },
        { hash: a, subject: 'a' },
      ],
      onPick: noop,
      onClose: noop,
    });
    assert.ok(isValidElement<{ children: React.ReactElement[] }>(menu));
    const keys = menu.props.children.map((entry) => entry.key);
    assert.strictEqual(new Set(keys).size, 3);
  });
});

const popup = (
  query: string,
  result?: Parameters<typeof LocationsPopup>[0]['lookup'],
  props: Partial<Parameters<typeof LocationsPopup>[0]> = {},
) =>
  renderToStaticMarkup(
    <LocationsPopup
      bookmarks={[]}
      repository={undefined}
      selected={undefined}
      anchor={{ current: null }}
      lookup={result}
      onLookup={noop}
      onJump={noop}
      onClose={noop}
      query={query}
      onQuery={noop}
      {...props}
    />,
  );

suite('Hash suggestion', () => {
  const hash = 'abcd'.padEnd(40, '0');
  test('offers the commit a typed hash is, like a first suggestion', () => {
    const html = popup('ABCD', {
      query: 'abcd',
      result: { kind: 'found', hash, subject: 'the subject' },
    });
    assert.strictEqual(
      tagsWith(html, 'row', 'hash-suggestion', 'active').length,
      1,
    );
    assert.match(html, /Go to commit.*abcd000.*the subject/);
  });

  test('says when no commit or several start with it', () => {
    assert.match(
      popup('abcd', { query: 'abcd', result: { kind: 'none' } }),
      /No commit starts with abcd/,
    );
    assert.match(
      popup('abcd', { query: 'abcd', result: { kind: 'ambiguous', count: 3 } }),
      /3 commits start with abcd, type more/,
    );
    assert.match(popup('abcd'), /Looking for commit abcd/);
  });

  test('waits for the lookup of what is typed now, not an earlier prefix', () => {
    const html = popup('abcde', {
      query: 'abcd',
      result: { kind: 'found', hash, subject: 's' },
    });
    assert.match(html, /Looking for commit abcde/);
    assert.strictEqual(tagsWith(html, 'hash-suggestion', 'active').length, 0);
  });

  test('offers nothing for what is no hash, or too short', () => {
    assert.doesNotMatch(popup('abc'), /hash-suggestion/);
    assert.doesNotMatch(popup('feature'), /hash-suggestion/);
  });
});

const repository = (...refs: [RefInfo['kind'], string][]): RepositoryState => ({
  head: undefined,
  headCommit: undefined,
  headUpstream: undefined,
  refs: refs.map(([kind, name]) => ({ kind, name, commit: 'c'.repeat(40) })),
});

const refs = repository(
  ['branch', 'main'],
  ['branch', 'feat/a'],
  ['branch', 'feat/b'],
  ['remote', 'origin/main'],
  ['tag', 'v1'],
);

const counts = (html: string) =>
  [...html.matchAll(/class="locations-count">(\d+)</g)].map((match) =>
    Number(match[1]),
  );

suite('Search', () => {
  test('offers a way back out beside its field', () => {
    tagWith(popup(''), 'title="Close (Esc)"', 'nav-button');
  });

  test('shows refs as trees, folders first, opening a lone folder', () => {
    const html = popup('', undefined, { repository: refs });
    assert.deepStrictEqual(counts(html), [3, 1, 1]);
    assert.match(
      html,
      /tree-row folder[^>]*><span class="twisty">▸<\/span>feat<\/div><\/div><div[^>]*title="main"/,
    );
    assert.match(
      tagWith(html, 'title="main"', 'tree-row', 'leaf'),
      new RegExp(`padding-left:${leafIndent(0, true)}px`),
    );
    assert.match(
      tagWith(html, 'title="origin/main"', 'tree-row', 'leaf'),
      new RegExp(`padding-left:${leafIndent(1, false)}px`),
    );
    assert.match(
      tagWith(html, 'title="v1"', 'tree-row', 'leaf'),
      new RegExp(`padding-left:${leafIndent(0, false)}px`),
    );
  });

  test('marks what matches, and counts only the matches', () => {
    const html = popup('fe', undefined, { repository: refs });
    assert.match(html, /<mark class="match">fe<\/mark>at\/a/);
    assert.deepStrictEqual(counts(html), [2, 0, 0]);
    assert.strictEqual(html.match(/No matches/g)?.length, 2);
  });

  test('marks a match ignoring case, and highlights the first one, skipping groups without any', () => {
    assert.match(
      popup('MAI', undefined, { repository: refs }),
      /<mark class="match">mai<\/mark>n/,
    );
    const html = popup('v1', undefined, { repository: refs });
    const active = tagsWith(html, 'row', 'result', 'active');
    assert.strictEqual(active.length, 1);
    assert.match(active[0], /title="v1"/);
  });

  test('marks the selected commit among bookmarks, but not what is checked out', () => {
    const html = popup('', undefined, {
      repository: { ...refs, head: 'main' },
      bookmarks: [{ kind: 'branch', name: 'main' }],
      selected: 'c'.repeat(40),
    });
    assert.strictEqual(tagsWith(html, 'row', 'result', 'pinned').length, 2);
    assert.strictEqual(
      tagsWith(html, 'row', 'result', 'pinned', 'selected').length,
      1,
    );
    assert.match(
      html,
      /Bookmarks<span class="locations-count">1<\/span><\/header><div class="locations-list"><div class="[^"]*selected/,
    );
  });

  test('pins the checked-out branch and bookmarks, showing one that is gone as such', () => {
    const html = popup('', undefined, {
      repository: { ...refs, head: 'main' },
      bookmarks: [{ kind: 'branch', name: 'gone' }],
    });
    assert.match(
      html,
      /<header class="locations-heading">Checked out<span class="locations-count">1<\/span><\/header><div class="locations-list"><div[^>]*><span class="badge branch[^"]*"[^>]*>main</,
    );
    assert.match(
      html,
      /<header class="locations-heading">Bookmarks<span class="locations-count">1<\/span><\/header><div class="locations-list"><div[^>]*><span class="badge branch[^"]* missing[^"]*"[^>]*>gone</,
    );
  });

  test('says how many more match than it shows', () => {
    const many = repository(
      ...Array.from({ length: 201 }, (_, index): [RefInfo['kind'], string] => [
        'branch',
        `b${index}`,
      ]),
    );
    const html = popup('b', undefined, { repository: many });
    assert.match(html, /1 more; type more to narrow it down/);
    assert.strictEqual(counts(html)[0], 201);
  });
});

suite('Menu items', () => {
  test('keys items apart that have the same label', () => {
    const items = renderedBy(MenuItems, {
      items: [
        { label: 'v1', onClick: noop },
        { separator: true },
        { label: 'v1', onClick: noop },
      ],
      onClose: noop,
    });
    assert.ok(isValidElement<{ children: React.ReactElement[] }>(items));
    const keys = items.props.children.map((item) => item.key);
    assert.strictEqual(new Set(keys).size, 3);
  });

  test('runs a plain item and closes the menu, but opens a submenu in place', () => {
    const log: string[] = [];
    const items = renderedBy(MenuItems, {
      items: [
        { label: 'a', onClick: () => log.push('a') },
        { label: 'sub', submenu: [{ label: 'x', onClick: noop }] },
      ],
      onClose: () => log.push('close'),
    });
    assert.ok(isValidElement<{ children: React.ReactElement[] }>(items));
    const [plain, sub] = items.props.children.map((entry) => {
      assert.ok(isValidElement<{ children: React.ReactNode[] }>(entry));
      const button = entry.props.children[0];
      assert.ok(isValidElement<{ onClick: () => void }>(button));
      return button;
    });
    plain.props.onClick();
    assert.deepStrictEqual(log, ['close', 'a']);
    sub.props.onClick();
    assert.deepStrictEqual(log, ['close', 'a']);
  });

  test('marks the picked one of several, and switches with a check', () => {
    const html = renderToStaticMarkup(
      <MenuItems
        items={[
          { label: 'View as List', checked: true, radio: true, onClick: noop },
          { label: 'Collapse', checked: false, onClick: noop },
          { separator: true },
          { label: 'Checkout', disabled: true, onClick: noop },
        ]}
        onClose={noop}
      />,
    );
    assert.match(html, /role="menuitemradio" aria-checked="true"/);
    assert.match(html, /role="menuitemcheckbox" aria-checked="false"/);
    assert.strictEqual(tagsWith(html, 'menu-separator').length, 1);
    assert.match(html, /role="menuitem"[^>]*disabled=""/);
  });
});

suite('Tab bar', () => {
  test('stops the middle button from autoscrolling, so a middle click closes the tab', () => {
    const closed: string[] = [];
    const nav = renderedBy(TabBar, {
      tabs: [{ root: '/repo', name: 'repo' }],
      active: '/repo',
      onSelect: noop,
      onPreload: noop,
      onClose: (root) => closed.push(root),
      onAdd: noop,
      onSort: noop,
      onLog: noop,
    });
    assert.ok(isValidElement<{ children: React.ReactElement[] }>(nav));
    const list = nav.props.children[0];
    assert.ok(isValidElement<{ children: React.ReactElement[][] }>(list));
    const tab = list.props.children[0][0];
    assert.ok(
      isValidElement<{
        onMouseDown: (event: {
          button: number;
          preventDefault: () => void;
        }) => void;
        onAuxClick: (event: { button: number }) => void;
      }>(tab),
    );
    let prevented = 0;
    const preventDefault = () => prevented++;
    tab.props.onMouseDown({ button: 0, preventDefault });
    assert.strictEqual(prevented, 0);
    tab.props.onMouseDown({ button: 1, preventDefault });
    assert.strictEqual(prevented, 1);
    tab.props.onAuxClick({ button: 1 });
    assert.deepStrictEqual(closed, ['/repo']);
  });
});

suite('Placeholders', () => {
  test('draws grey bars in rows of the given kind', () => {
    const html = renderToStaticMarkup(
      <SkeletonRows count={3} className="diff-line" />,
    );
    assert.strictEqual(tagsWith(html, 'diff-line', 'skeleton-row').length, 3);
    assert.match(html, /aria-busy="true"/);
  });
});

suite('Graph cell', () => {
  test('draws a line repeated in a row once, over the lines its last copy was over', () => {
    const a = { from: 0, to: 0, color: 0, bottom: false };
    const b = { from: 1, to: 1, color: 1, bottom: false };
    const html = renderToStaticMarkup(
      <GraphCell
        row={{ lane: 0, color: 0, lines: [a, b, a] }}
        height={30}
        onToggleMerge={noop}
      />,
    );
    assert.deepStrictEqual(
      [...html.matchAll(/<path[^>]*stroke="([^"]*)"/g)].map(
        (match) => match[1],
      ),
      ['var(--vscode-charts-green)', 'var(--vscode-charts-blue)'],
    );
  });
});

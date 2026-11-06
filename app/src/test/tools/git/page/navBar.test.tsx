import * as assert from 'node:assert';
import { isValidElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { suite, test } from 'vitest';
import { comparisonOf } from '../../../../tools/git/shared/comparisons';
import { workingTreeHash } from '../../../../tools/git/shared/protocol';
import {
  AddressBar,
  historyButtonClick,
  historyLabel,
  HistoryMenu,
  locationsPopupKey,
  nextHistoryOpen,
  NavButtons,
} from '../../../../tools/git/page/navBar';
import { GitStore } from '../../../../tools/git/page/store';
import type {
  GitToHost,
  NavigationEntry,
} from '../../../../tools/git/shared/protocol';
import {
  gitStore,
  renderedInGit,
  type ShownGit,
} from '../../../componentFixtures';
import { classesOf, noop, renderedBy, tagWith } from '../../../fixtures';

const at = 'a'.repeat(40);

const navStore = (
  shown: ShownGit & {
    readonly back?: readonly NavigationEntry[];
    readonly forward?: readonly NavigationEntry[];
    readonly fetching?: boolean;
  } = {},
  post: (message: GitToHost) => void = noop,
) => {
  const { back = [], forward = [], fetching = false, ...rest } = shown;
  return gitStore(
    {
      headCommit: 'headCommit' in shown ? shown.headCommit : at,
      autoFetchMinutes: 1,
      ...rest,
      tab: { root: '/repo', back, forward, fetching },
    },
    post,
  );
};

const buttons = (shown: Parameters<typeof navStore>[0]) =>
  renderToStaticMarkup(
    <GitStore value={navStore(shown)}>
      <NavButtons />
    </GitStore>,
  );

const minute = 60_000;
const hour = 60 * minute;
const day = 24 * hour;

suite('Navigation bar', () => {
  test('greys out back and forward without steps', () => {
    const html = buttons({
      back: [{ hash: 'a'.repeat(40), subject: 'a' }],
    });
    assert.match(html, /title="Back[^"]*"(?![^>]*disabled)/);
    assert.match(html, /title="Forward[^"]*" disabled=""/);
  });

  test('shows nothing of the commit search until it is opened, as the button opening it sits among the buttons of the column', () => {
    const html = renderToStaticMarkup(
      <GitStore value={gitStore()}>
        <AddressBar asked={0} />
      </GitStore>,
    );
    assert.doesNotMatch(html, /address-bar|Search…|<button/);
  });

  test('opens the search popup anew in another tab, so it searches again there for the same query', () => {
    assert.notEqual(locationsPopupKey(1, '/a'), locationsPopupKey(1, '/b'));
    assert.equal(locationsPopupKey(1, '/a'), locationsPopupKey(1, '/a'));
    assert.notEqual(locationsPopupKey(1, '/a'), locationsPopupKey(2, '/a'));
  });

  test('spins the fetch button while fetching', () => {
    const spinning = tagWith(
      buttons({ fetching: true }),
      'title="Fetch every remote',
      'nav-button',
      'running',
    );
    assert.match(spinning, /disabled=""/);
    const idle = tagWith(
      buttons({}),
      'title="Fetch every remote',
      'nav-button',
    );
    assert.ok(!classesOf(idle).has('running'));
  });

  test('says when it last fetched in the fetch button tooltip, marking nothing while that is fresh', () => {
    const html = buttons({
      lastFetch: { succeeded: Date.now() - 3 * minute },
      autoFetch: true,
      autoFetchMinutes: 5,
    });
    tagWith(
      html,
      'title="Fetch every remote, dropping branches deleted there\nFetched 3 minutes ago"',
      'nav-button',
    );
    assert.doesNotMatch(html, /fetch-mark/);
    assert.doesNotMatch(buttons({}), /fetch-mark|Fetched/);
  });

  test('marks the fetch button once fetching every few minutes missed a round', () => {
    const html = buttons({
      lastFetch: { succeeded: Date.now() - 3 * day },
      autoFetch: true,
      autoFetchMinutes: 5,
    });
    tagWith(html, '', 'fetch-mark', 'stale');
    tagWith(html, 'Fetched 3 days ago"', 'nav-button');
  });

  test('marks the fetch button when the last fetch failed, saying when it last fetched', () => {
    const html = buttons({
      lastFetch: {
        succeeded: Date.now() - 2 * hour,
        failed: Date.now() - minute,
      },
    });
    tagWith(html, '', 'fetch-mark', 'failed');
    tagWith(
      html,
      'Couldn&#x27;t fetch 1 minute ago\nLast fetched 2 hours ago"',
      'nav-button',
    );
    tagWith(
      buttons({ lastFetch: { failed: Date.now() } }),
      'Couldn&#x27;t fetch just now"',
      'nav-button',
    );
  });

  test('leaves the mark off while fetching, as the spinning button says more', () => {
    assert.doesNotMatch(
      buttons({ fetching: true, lastFetch: { failed: Date.now() } }),
      /fetch-mark/,
    );
  });

  test('pins fetching every few minutes next to the fetch button, hidden when the settings turn it off', () => {
    tagWith(buttons({}), 'title="Fetch Every Minute"');
    const on = tagWith(
      buttons({ autoFetch: true, autoFetchMinutes: 5 }),
      'title="Fetch Every 5 Minutes"',
      'nav-button',
      'toggle',
      'active',
    );
    assert.match(on, /aria-pressed="true"/);
    assert.doesNotMatch(
      buttons({ autoFetch: true, autoFetchMinutes: 0 }),
      /Fetch Every/,
    );
  });

  test('fetches on its button, and pins fetching every few minutes on the pin, unpinning it again', () => {
    for (const autoFetch of [false, true]) {
      const posted: GitToHost[] = [];
      const bar = renderedInGit(
        navStore({ autoFetch }, (message) => posted.push(message)),
        NavButtons,
        {},
      );
      assert.ok(isValidElement<{ children: React.ReactElement[] }>(bar));
      const pair = bar.props.children[3];
      assert.ok(isValidElement<{ children: React.ReactElement[] }>(pair));
      for (const button of pair.props.children) {
        assert.ok(isValidElement<{ onClick: () => void }>(button));
        button.props.onClick();
      }
      assert.deepStrictEqual(posted, [
        { type: 'fetch', root: '/repo' },
        { type: 'setAutoFetch', on: !autoFetch },
      ]);
    }
  });

  test('holds the pin together with the fetch button at the end, filling both as one while pinned', () => {
    for (const autoFetch of [false, true]) {
      assert.match(
        buttons({ autoFetch }),
        new RegExp(
          `<span class="pin-pair ${autoFetch ? 'pinned' : ''}"><button[^>]*title="Fetch[^"]*"[^>]*>.*?</button><button[^>]*title="Fetch Every Minute"[^>]*>.*?</button></span></div>$`,
        ),
      );
    }
  });

  test('selects the checked-out commit on a home button after forward, as H does, disabled while there is none', () => {
    const posted: GitToHost[] = [];
    const bar = renderedInGit(
      navStore({}, (message) => posted.push(message)),
      NavButtons,
      {},
    );
    assert.ok(isValidElement<{ children: React.ReactElement[] }>(bar));
    const home = bar.props.children[2];
    assert.ok(isValidElement<{ onClick: () => void }>(home));
    home.props.onClick();
    assert.deepStrictEqual(posted, [{ type: 'jump', hash: at, root: '/repo' }]);
    assert.match(
      buttons({}),
      /title="Forward[^"]*"[^>]*>.*?<\/button><\/div><button class="nav-button" title="Select the checked-out commit">/,
    );
    assert.match(
      buttons({ headCommit: undefined }),
      /title="Select the checked-out commit" disabled=""/,
    );
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

  test('close their history once it has no entries, so it stays closed when entries return', () => {
    let open = true;
    open = nextHistoryOpen(open, 0);
    assert.strictEqual(open, false);
    open = nextHistoryOpen(open, 2);
    assert.strictEqual(open, false);
    assert.strictEqual(nextHistoryOpen(true, 2), true);
  });

  test('go as many steps as the picked entry is from the current one', () => {
    const picked: number[] = [];
    const menu = renderedBy(HistoryMenu, {
      container: { current: null },
      entries: ['a', 'b', 'c'].map((hash) => ({
        hash: hash.repeat(40),
        subject: hash,
      })),
      onPick: (steps) => picked.push(steps),
      onClose: noop,
    });
    assert.ok(
      isValidElement<{
        children: React.ReactElement<{
          children: React.ReactElement<{ onClick: () => void }>;
        }>[];
      }>(menu),
    );
    menu.props.children[0].props.children.props.onClick();
    menu.props.children[2].props.children.props.onClick();
    assert.deepStrictEqual(picked, [1, 3]);
  });

  test('hold each entry the way other menus do, so the keys move between them alike, leaving room for a check before it as they do', () => {
    const menu = renderToStaticMarkup(
      <HistoryMenu
        container={{ current: null }}
        entries={[{ hash: 'a'.repeat(40), subject: 'a' }]}
        onPick={noop}
        onClose={noop}
      />,
    );
    assert.match(
      menu,
      /^<div class="menu history-menu" role="menu"><div class="menu-entry"><button class="menu-item history-item"[^>]*><span class="menu-check"><\/span><span class="history-hash">/,
    );
  });

  test('label an entry by its short hash, or a comparison by both', () => {
    const a = 'a'.repeat(40);
    const b = 'b'.repeat(40);
    assert.strictEqual(historyLabel(a), 'aaaaaaa');
    assert.strictEqual(historyLabel(comparisonOf(a, b)), 'aaaaaaa → bbbbbbb');
    const menu = renderToStaticMarkup(
      <HistoryMenu
        container={{ current: null }}
        entries={[{ hash: comparisonOf(a, b), subject: undefined }]}
        onPick={noop}
        onClose={noop}
      />,
    );
    assert.match(menu, /<span class="history-hash">aaaaaaa → bbbbbbb<\/span>/);
  });

  test('label the uncommitted changes as such, alone or compared', () => {
    const a = 'a'.repeat(40);
    assert.strictEqual(historyLabel(workingTreeHash), 'uncommitted');
    assert.strictEqual(
      historyLabel(comparisonOf(a, workingTreeHash)),
      'aaaaaaa → uncommitted',
    );
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

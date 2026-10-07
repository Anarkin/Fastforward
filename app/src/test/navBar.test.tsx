import * as assert from 'node:assert';
import { isValidElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { comparisonOf } from '../shared/comparisons';
import { workingTreeHash } from '../shared/protocol';
import {
  AddressBar,
  historyButtonClick,
  historyLabel,
  HistoryMenu,
  locationsPopupKey,
  nextHistoryOpen,
  NavButtons,
} from '../webview/navBar';
import { classesOf, noop, renderedBy, tagWith } from './fixtures';

const buttons = (props: Partial<Parameters<typeof NavButtons>[0]>) =>
  renderToStaticMarkup(
    <NavButtons
      back={[]}
      forward={[]}
      onNavigate={noop}
      fetching={false}
      onFetch={noop}
      autoFetch={false}
      autoFetchMinutes={1}
      onAutoFetch={noop}
      {...props}
    />,
  );

suite('Navigation bar', () => {
  test('greys out back and forward without steps', () => {
    const html = buttons({
      back: [{ hash: 'a'.repeat(40), subject: 'a' }],
    });
    assert.match(html, /title="Back[^"]*"(?![^>]*disabled)/);
    assert.match(html, /title="Forward[^"]*" disabled=""/);
  });

  test('says Search… in the search field, and what it searches in its tooltip', () => {
    const html = renderToStaticMarkup(
      <AddressBar
        root="/repo"
        bookmarks={[]}
        repository={undefined}
        hashLookup={undefined}
        onLookupHash={noop}
        commitSearch={undefined}
        onSearchCommits={noop}
        onJump={noop}
      />,
    );
    tagWith(
      html,
      'title="Search branches, remotes, tags and commits"',
      'address-bar',
    );
    assert.match(html, /class="address-text empty">Search…<\/span>/);
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

  test('pins fetching every few minutes next to the fetch button, hidden when the settings turn it off', () => {
    tagWith(buttons({}), 'title="Fetch Every Minute"');
    const on = tagWith(
      buttons({ autoFetch: true, autoFetchMinutes: 5 }),
      'title="Stop Fetching Every 5 Minutes"',
      'nav-button',
      'toggle',
      'active',
    );
    assert.match(on, /aria-pressed="true"/);
    assert.doesNotMatch(
      buttons({ autoFetch: true, autoFetchMinutes: 0 }),
      /Fetch(ing)? Every/,
    );
  });

  test('fetches on its button, and pins fetching every few minutes on the pin, unpinning it again', () => {
    for (const autoFetch of [false, true]) {
      const clicked: string[] = [];
      const bar = renderedBy(NavButtons, {
        back: [],
        forward: [],
        onNavigate: noop,
        fetching: false,
        onFetch: () => clicked.push('fetch'),
        autoFetch,
        autoFetchMinutes: 1,
        onAutoFetch: (on) => clicked.push(`pin ${on}`),
      });
      assert.ok(isValidElement<{ children: React.ReactElement[] }>(bar));
      const pair = bar.props.children[2];
      assert.ok(isValidElement<{ children: React.ReactElement[] }>(pair));
      for (const button of pair.props.children) {
        assert.ok(isValidElement<{ onClick: () => void }>(button));
        button.props.onClick();
      }
      assert.deepStrictEqual(clicked, ['fetch', `pin ${!autoFetch}`]);
    }
  });

  test('holds the pin together with the fetch button, filling both as one while pinned', () => {
    for (const autoFetch of [false, true]) {
      assert.match(
        buttons({ autoFetch }),
        new RegExp(
          `<span class="pin-pair ${autoFetch ? 'pinned' : ''}"><button[^>]*title="Fetch[^"]*"[^>]*>.*?</button><button[^>]*title="${autoFetch ? 'Stop Fetching' : 'Fetch'} Every Minute"[^>]*>.*?</button></span></div>$`,
        ),
      );
    }
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

  test('hold each entry the way other menus do, so the keys move between them alike', () => {
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
      /^<div class="menu history-menu" role="menu"><div class="menu-entry"><button class="menu-item history-item"/,
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

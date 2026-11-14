import * as assert from 'node:assert';
import { createElement } from 'react';
import { suite, test } from 'vitest';
import { columnFocusAttribute } from '../../../lib/page/columnFocus';
import { RefBubble } from '../../../tools/git/page/bubbles';
import { GitStore } from '../../../tools/git/page/store';
import { GraphCell } from '../../../tools/git/page/graph';
import { Column } from '../../../tools/git/page/column';
import { columnsClass } from '../../../tools/git/page/columns';
import {
  bubbleLineHeight,
  commitRowHeight,
  workingTreeRowHeight,
} from '../../../tools/git/page/commitList';
import { allWithClass, cascaded, rendered, withClass } from '../../cascade';
import { renderedBy } from '../../fixtures';
import { gitStore } from '../../componentFixtures';
import {
  bubbles,
  columns,
  columnTitle,
  commitRow,
  commitsFound,
  contextMenu,
  historyMenu,
  locationsPopup,
  messagePanel,
  navButtons,
  notices,
  repository,
  workingTreeRow,
} from '../../styleFixtures';
import {
  noop,
  buttonsWidth,
  pixels,
  looks,
  looksAlike,
  graphBesideCommit,
  bodyVariable,
  sidesOf,
  layer,
  hovered,
  focused,
  after,
  commitColumnTitle,
  shortcutsPopup,
  keyOf,
  shownScrollbar,
  badgeRules,
  columnVisibility,
  unwrapped,
  bubbleLook,
  branchBubble,
  tagHoleReach,
} from './stylesheetFixtures';

suite('Style', () => {
  test("keeps the commit column's title clear of its buttons and the gaps between them", () => {
    const title = commitColumnTitle(0);
    assert.strictEqual(
      pixels(cascaded(title, 'padding-left')),
      buttonsWidth(4),
    );
    assert.strictEqual(
      pixels(cascaded(title, 'padding-right')),
      buttonsWidth(2, 'right'),
    );
    assert.strictEqual(
      pixels(cascaded(commitColumnTitle(5), 'padding-left')),
      buttonsWidth(5),
    );
  });

  test("opens the search over the commit column's title without moving its field or back button", () => {
    const title = commitColumnTitle(0);
    assert.strictEqual(cascaded(title, 'height'), 'var(--title-height)');
    const border = cascaded(title, 'border-bottom');
    const [line] = (border ?? '').split(' ');
    assert.strictEqual(
      cascaded(withClass(locationsPopup(''), 'locations-groups'), 'border-top'),
      border,
    );
    const edge = cascaded(withClass(title, 'column-start'), 'left');
    assert.match(edge ?? '', /^\d+px$/);
    assert.strictEqual(line, '1px');
    looks(withClass(locationsPopup(''), 'locations-search-row'), {
      height: 'calc(var(--title-height) - var(--hairline))',
      'box-sizing': 'border-box',
      margin: undefined,
      'margin-top': undefined,
      'margin-bottom': undefined,
      padding: `var(--column-line, 0px) var(--search-gap) 0 ${edge}`,
    });
  });

  test('writes the title of the checked-out commit in bold, in its whole message too', () => {
    const checkedOut = withClass(
      rendered(commitRow({ headCommit: 'a' })),
      'subject',
    );
    looks(checkedOut, { 'font-weight': '600' });
    looks(withClass(rendered(commitRow({ headCommit: 'b' })), 'subject'), {
      'font-weight': undefined,
    });
    looks(withClass(messagePanel({ headCommit: 'a' }), 'subject'), {
      'font-weight': cascaded(checkedOut, 'font-weight'),
    });
    looks(withClass(messagePanel({ headCommit: 'b' }), 'subject'), {
      'font-weight': undefined,
    });
  });

  test("pops a commit's row out over itself like the other popups, ringed with their edge over the row's tint, letting the pointer through to the rows under it", () => {
    const panel = messagePanel();
    looks(panel, {
      position: 'fixed',
      'box-sizing': 'border-box',
      'margin-right': 'var(--gutter-width)',
      background: 'var(--color-panel-background)',
      'border-radius': 'var(--card-radius)',
      'pointer-events': 'none',
    });
    const [edge] = (bodyVariable('popup-shadow') ?? '').split(',');
    assert.match(edge, /^inset /);
    looks(
      panel,
      {
        position: 'absolute',
        inset: '0',
        'border-radius': 'inherit',
        'box-shadow': edge,
      },
      after,
    );
  });

  test("casts the shadow of a popped-out row from behind its text rather than from the row, as a shadow on the text's own layer turns its subpixel antialiasing off, blurring it next to the rows, cutting a long message off inside the row instead, as cutting the popup off would cut its shadow off too", () => {
    const panel = messagePanel();
    looks(panel, { overflow: undefined, 'box-shadow': undefined });
    looks(
      panel,
      {
        content: "''",
        position: 'absolute',
        inset: '0',
        'z-index': '-1',
        'border-radius': 'inherit',
        'box-shadow': 'var(--popup-shadow)',
      },
      { pseudoElement: '::before' },
    );
    looks(withClass(panel, 'commit'), {
      'box-sizing': 'border-box',
      'max-height': 'inherit',
      overflow: 'hidden',
      'border-radius': 'inherit',
    });
  });

  test("extends the popped-out row: as white as the other popups, though its row is under the pointer or selected, or the pointer is on it pinned, its subject wrapped in lines as tall as the row's, its author and date as wide as the row, then the rest of the message with its line breaks", () => {
    const panel = messagePanel();
    const row = withClass(panel, 'commit');
    looks(row, { 'border-bottom': undefined, background: 'none' });
    looks(row, { background: 'none' }, hovered);
    looks(withClass(messagePanel({ selected: 'a' }), 'commit'), {
      background: 'none',
    });
    const rowLine = cascaded(
      withClass(rendered(commitRow()), 'commit-line'),
      'height',
    );
    assert.ok(rowLine);
    looks(withClass(panel, 'commit-line'), { height: 'auto' });
    looks(withClass(panel, 'subject'), {
      'line-height': rowLine,
      'white-space': 'normal',
      'overflow-wrap': 'anywhere',
    });
    looks(withClass(panel, 'commit-line', 'secondary'), {
      height: rowLine,
      width: 'var(--peek-row-width)',
    });
    looks(withClass(panel, 'message-body'), {
      'line-height': rowLine,
      'white-space': 'pre-wrap',
      'overflow-wrap': 'anywhere',
    });
  });

  test('dims a clean working tree like an author or a folder', () => {
    looks(withClass(workingTreeRow(0), 'subject'), {
      opacity: 'var(--muted-opacity)',
    });
    looks(withClass(workingTreeRow(1), 'subject'), { opacity: undefined });
  });

  test('draws every bubble but the checked-out one and tags alike, in the bubble colors, ringed inside in the bubble border color to stand apart from a selected row', () => {
    const all = bubbles().filter(
      (bubble) =>
        !bubble.classes.includes('checked-out') &&
        !bubble.classes.includes('tag') &&
        !bubble.classes.includes('remote-tag'),
    );
    for (const kind of ['branch', 'remote', 'stash', 'hash', 'missing']) {
      assert.ok(
        all.some((bubble) => bubble.classes.includes(kind)),
        kind,
      );
    }
    for (const bubble of all) {
      looks(bubble, {
        color: 'var(--color-git-bubble-foreground)',
        background: 'var(--color-git-bubble)',
        'box-shadow':
          'inset 0 0 0 var(--hairline) var(--color-git-bubble-border)',
        border: undefined,
      });
    }
  });

  test('shapes a tag like a tag icon, pointed at the right end with the corners of the point rounded by about a pixel and a round hole by the point that shows the row through it, leaving room for both after the name, so it stands apart from the branches, which move on as tags never do', () => {
    const tags = bubbles().filter(
      (bubble) =>
        bubble.classes.includes('tag') || bubble.classes.includes('remote-tag'),
    );
    for (const kind of ['tag', 'remote-tag']) {
      assert.ok(
        tags.some((tag) => tag.classes.includes(kind)),
        kind,
      );
    }
    for (const tag of tags) {
      assert.strictEqual(
        unwrapped(cascaded(tag, 'background')),
        'radial-gradient(circle at calc(100% - 9px) 50%, transparent 2px, var(--color-git-bubble) 2.5px)',
      );
      assert.strictEqual(
        unwrapped(cascaded(tag, 'clip-path')),
        'shape(from 0 0, hline to calc(100% - 8px), curve to calc(100% - 6.4px) 0.8px with calc(100% - 7px) 0, line to calc(100% - 0.8px) calc(50% - 1px), curve to calc(100% - 0.8px) calc(50% + 1px) with 100% 50%, line to calc(100% - 6.4px) calc(100% - 0.8px), curve to calc(100% - 8px) 100% with calc(100% - 7px) 100%, hline to 0, close)',
      );
      looks(tag, {
        color: 'var(--color-git-bubble-foreground)',
        'box-shadow': cascaded(branchBubble(), 'box-shadow'),
        border: undefined,
      });
      assert.ok(
        parseFloat(cascaded(tag, 'padding-right') ?? '') >= tagHoleReach(tag),
      );
    }
  });

  test("pads the bottom of a pinned commit's message, so its last line keeps clear of the popup's edge as its first line does", () => {
    looks(
      withClass(
        rendered(
          createElement(
            'div',
            { className: 'message-peek pinned' },
            createElement('div', { className: 'commit' }),
          ),
        ),
        'commit',
      ),
      { 'padding-bottom': '4px' },
    );
  });

  test("keeps a tag's hole and point clear of the push button on it, which squares off, as the tag goes on past it", () => {
    const tag = withClass(
      rendered(
        createElement(
          GitStore,
          { value: gitStore({ tagRemote: 'origin' }) },
          createElement(
            'div',
            { className: 'bubble-line' },
            createElement(RefBubble, {
              info: { kind: 'tag', name: 'v1' },
              actions: true,
            }),
          ),
        ),
      ),
      'badge',
    );
    assert.ok(
      parseFloat(cascaded(tag, 'padding-right') ?? '') >= tagHoleReach(tag),
    );
    looks(withClass(tag, 'bubble-action'), { 'border-radius': '0' });
  });

  test('keeps a bubble with buttons within its line, cutting off its long name with an ellipsis and never its buttons', () => {
    const line = rendered(
      createElement(
        GitStore,
        {
          value: gitStore({ head: 'docs/a-branch-name-longer-than-its-line' }),
        },
        createElement(
          'div',
          { className: 'bubble-line' },
          createElement(RefBubble, {
            info: {
              kind: 'branch',
              name: 'docs/a-branch-name-longer-than-its-line',
            },
            actions: true,
          }),
        ),
      ),
    );
    looks(withClass(line, 'badge', 'with-actions'), {
      'max-width': 'calc(100% + var(--bubble-inset))',
    });
    looks(withClass(line, 'bubble-name'), {
      overflow: 'hidden',
      'text-overflow': 'ellipsis',
      'min-width': '0',
    });
    looks(withClass(line, 'bubble-actions'), { flex: 'none' });
  });

  test('dims an arrow of the blue bubble with nothing to do, and counts in figures of one width, so the bubble keeps its size as the counts change', () => {
    const actions = rendered(
      createElement(
        GitStore,
        { value: gitStore({ head: 'main' }) },
        createElement(RefBubble, {
          info: { kind: 'branch', name: 'main' },
          tracking: { upstream: 'origin/main', ahead: 0, behind: 12 },
          actions: true,
        }),
      ),
    );
    looks(withClass(actions, 'bubble-action', 'idle'), {
      opacity: 'var(--muted-opacity)',
    });
    looks(withClass(actions, 'bubble-count'), {
      'font-variant-numeric': 'tabular-nums',
    });
  });

  test('fills the checked-out bubble with its own colors, ringing it like the others in its own border color, and no bubble changes under the pointer', () => {
    const all = bubbles('main');
    const checkedOut = all.filter((bubble) =>
      bubble.classes.includes('checked-out'),
    );
    for (const kind of ['head', 'branch']) {
      assert.ok(
        checkedOut.some((bubble) => bubble.classes.includes(kind)),
        kind,
      );
    }
    const ring = cascaded(branchBubble(), 'box-shadow')?.replace(
      'var(--color-git-bubble-border)',
      'var(--color-git-bubble-checked-out-border)',
    );
    for (const bubble of checkedOut) {
      looks(bubble, {
        color: 'var(--color-git-bubble-checked-out-foreground)',
        background: 'var(--color-git-bubble-checked-out)',
        'box-shadow': ring,
        border: undefined,
      });
    }
    assert.ok(all.some((bubble) => bubble.parent?.classes.includes('active')));
    for (const bubble of all) {
      looksAlike(bubble, bubbleLook, hovered);
    }
  });

  test('hides every column but the commits while no commit is selected', () => {
    assert.deepStrictEqual(columnVisibility(undefined), [
      undefined,
      'hidden',
      'hidden',
    ]);
    assert.deepStrictEqual(columnVisibility('a'), [
      undefined,
      undefined,
      undefined,
    ]);
  });

  test('hides the diff while the commit selected has no change to show, keeping its place', () => {
    assert.deepStrictEqual(columnVisibility('a', false), [
      undefined,
      undefined,
      'hidden',
    ]);
  });

  test('draws a commit row and the one-line working tree row as tall as the list expects, as lines of the line height of the settings with nothing above or below them', () => {
    const commit = rendered(commitRow({ refs: repository.refs }));
    for (const row of [commit, workingTreeRow(1)]) {
      looks(row, {
        padding: '0 8px',
        'border-bottom': undefined,
      });
      looks(withClass(row, 'commit-line'), {
        height: 'var(--row-line-height)',
      });
    }
    looks(withClass(commit, 'commit-line', 'secondary'), {
      height: 'var(--row-line-height)',
      margin: undefined,
      'margin-top': undefined,
      'margin-bottom': undefined,
    });
    looks(withClass(commit, 'bubble-line'), {
      'line-height': 'var(--row-line-height)',
    });
    assert.deepStrictEqual(
      [commitRowHeight, workingTreeRowHeight, bubbleLineHeight],
      [2 * 18, 18, 18],
    );
  });

  test('draws no lines between the commits of the commit column, so its lines fall on those of the other columns, and keeps the line under its title, as the other columns have it', () => {
    const column = rendered(
      renderedBy(Column, {
        start: navButtons(),
        children: createElement(
          'div',
          { className: 'virtual-rows list commit-rows' },
          commitRow(),
        ),
      }),
    );
    looks(withClass(column, 'commit'), {
      'border-bottom': undefined,
      'border-bottom-color': undefined,
    });
    for (const title of [
      withClass(column, 'column-title'),
      columnTitle(null),
    ]) {
      looks(title, {
        'border-bottom': '1px solid var(--color-border)',
        'border-bottom-color': undefined,
      });
    }
  });

  test("keeps the line under the field of the search opened over the commit column's title, where the title's is, and draws none between its groups nor between the commits it found, as the list draws none", () => {
    const popup = locationsPopup('');
    const groups = allWithClass(popup, 'locations-group');
    assert.ok(groups.length > 1, String(groups.length));
    looks(withClass(popup, 'locations-groups'), {
      'border-top': '1px solid var(--color-border)',
      'border-top-color': undefined,
    });
    for (const group of groups.slice(1)) {
      looks(group, {
        'border-top': undefined,
        'border-top-color': undefined,
      });
    }
    const found = allWithClass(commitsFound('next'), 'commit');
    assert.strictEqual(found.length, 2);
    for (const commit of found) {
      looks(commit, {
        'border-bottom': undefined,
        'border-bottom-color': undefined,
      });
    }
  });

  test('lays the search opened over the commit column out in lines of the line height of the settings, as the columns beside it, each heading, row and note a line with nothing above or below it, and its groups one under the other', () => {
    const popup = locationsPopup('');
    const groups = allWithClass(popup, 'locations-group');
    assert.ok(groups.length > 1, String(groups.length));
    for (const group of groups) {
      looks(group, {
        margin: undefined,
        'margin-top': undefined,
        padding: undefined,
      });
      looks(withClass(group, 'locations-heading'), {
        padding: '0 8px',
        'padding-top': undefined,
        'line-height': 'var(--row-line-height)',
      });
      looks(withClass(group, 'locations-list'), {
        padding: undefined,
        'padding-bottom': undefined,
      });
    }
    const rows = allWithClass(popup, 'row');
    assert.ok(rows.length > 1, String(rows.length));
    for (const row of rows) {
      looks(row, {
        height: 'var(--row-line-height)',
        'line-height': 'var(--row-line-height)',
      });
    }
    looks(rendered(createElement('div', { className: 'locations-empty' })), {
      padding: '0 8px',
      'line-height': 'var(--row-line-height)',
    });
    looks(withClass(locationsPopup('abcd'), 'hash-suggestion', 'empty'), {
      height: 'var(--row-line-height)',
      padding: '0 8px',
      margin: undefined,
      'margin-top': undefined,
    });
  });

  test('grounds the graph of a commit, which stands beside its row rather than in it, in the color the row shows, each color that mixes in transparent made opaque by mixing in the panel instead, so the edge around a dot matches a hovered or selected row', () => {
    assert.strictEqual(
      bodyVariable('hover-ground'),
      bodyVariable('hover-background')?.replace(
        'transparent',
        'var(--color-panel-background)',
      ),
    );
    assert.doesNotMatch(
      bodyVariable('selection-background') ?? '',
      /transparent/,
    );
    const plain = graphBesideCommit();
    const graph = withClass(plain, 'graph');
    looks(graph, { '--graph-ground': 'var(--color-panel-background)' });
    looks(
      graph,
      { '--graph-ground': 'var(--hover-ground)' },
      { hover: withClass(plain, 'commit') },
    );
    looks(withClass(graphBesideCommit('a'), 'graph'), {
      '--graph-ground': 'var(--selection-background)',
    });
  });

  test('lets the graph of a row draw past its edges, so its lines can reach over the ends of those of the row above', () => {
    looks(
      rendered(
        createElement(GraphCell, {
          row: { lane: 0, color: 0, lines: [] },
          height: commitRowHeight,
          line: bubbleLineHeight,
          onToggleMerge: noop,
        }),
      ),
      { overflow: 'visible' },
    );
  });

  test('draws bubbles in the flow of their line, starting where the other lines start, each kept within the line, cutting off its long name with an ellipsis', () => {
    const commit = rendered(
      commitRow({
        hideDimmed: true,
        refs: repository.refs.map((ref) =>
          ref.kind === 'branch'
            ? {
                ...ref,
                tracking: { upstream: 'origin/main', ahead: 0, behind: 0 },
              }
            : ref,
        ),
      }),
    );
    const line = cascaded(withClass(commit, 'bubble-line'), 'line-height');
    for (const badge of allWithClass(commit, 'badge')) {
      const height = cascaded(badge, 'height');
      looks(badge, {
        display: 'inline-block',
        'max-width': 'calc(100% + var(--bubble-inset))',
        'line-height': height,
        'vertical-align': 'top',
        overflow: 'hidden',
        'text-overflow': 'ellipsis',
        padding: '0 var(--bubble-inset)',
      });
      const margin = sidesOf(badge, 'margin');
      assert.strictEqual(margin.left, 'calc(-1 * var(--bubble-inset))');
      assert.strictEqual(line, 'var(--row-line-height)');
      assert.strictEqual(margin.top, '1px');
      assert.strictEqual(height, 'calc(var(--row-line-height) - 2px)');
    }
    looks(withClass(commit, 'bubble-line'), {
      'margin-left': 'calc(-1 * var(--bubble-inset))',
      'padding-left': 'var(--bubble-inset)',
    });
  });

  test("draws the bubbles of a commit a search found as in the commit list, cutting off only a ref that is a result's own row", () => {
    const commit = commitRow({
      refs: [{ kind: 'branch', name: 'main', commit: 'a' }],
    });
    assert.deepStrictEqual(
      badgeRules(createElement('div', { className: 'locations-list' }, commit)),
      badgeRules(commit),
    );
    looks(
      withClass(
        rendered(
          createElement(
            'div',
            { className: 'locations-list' },
            createElement(
              'div',
              { className: 'row result' },
              createElement(RefBubble, {
                info: { kind: 'branch', name: 'main' },
              }),
            ),
          ),
        ),
        'badge',
      ),
      { overflow: 'hidden', 'text-overflow': 'ellipsis' },
    );
  });

  test('draws no focus outline around the commit list, whose selected row shows where the keys go', () => {
    const list = rendered(
      createElement('div', {
        className: 'virtual-rows list',
        [columnFocusAttribute]: '',
      }),
    );
    for (const states of [{}, focused]) {
      looks(list, { outline: 'none' }, states);
    }
  });

  test("hides the overlay scrollbars while a commit's whole message is peeked at, as they are drawn over everything and would cut through it, but not while one is pinned, which scrolls with them", () => {
    looks(shownScrollbar('message-peek'), { opacity: '0' });
    looks(shownScrollbar('message-peek pinned'), { opacity: '1' });
    looks(shownScrollbar(), { opacity: '1' });
  });

  test('puts the pin and the keys pinning a message peeked at, or the button closing a pinned one, beside the subject at the top right, on its first line and muted like the author, the keys drawn like the shortcuts screen draws them', () => {
    const rowLine = cascaded(
      withClass(rendered(commitRow()), 'commit-line'),
      'height',
    );
    const corner = withClass(messagePanel(), 'message-corner');
    looks(corner, {
      flex: 'none',
      'align-self': 'flex-start',
      display: 'grid',
      'align-items': 'center',
      height: rowLine,
      color: 'var(--muted-foreground)',
      'font-size': 'calc(var(--font-size) * 0.85)',
    });
    looks(withClass(corner, 'message-hint'), {
      'grid-area': '1 / 1',
      display: 'flex',
      'align-items': 'center',
    });
    const shortcutCap = withClass(shortcutsPopup(), 'shortcut-combo');
    const cornerCap = withClass(corner, 'shortcut-combo');
    for (const property of [
      'display',
      'border',
      'border-bottom-width',
      'border-radius',
    ]) {
      assert.strictEqual(
        cascaded(cornerCap, property),
        cascaded(shortcutCap, property),
        property,
      );
    }
    const shortcutKey = keyOf(shortcutCap);
    const cornerKey = keyOf(cornerCap);
    assert.ok(shortcutKey && cornerKey);
    assert.strictEqual(
      cascaded(cornerKey, 'padding'),
      cascaded(shortcutKey, 'padding'),
    );
    const close = withClass(messagePanel({}, true), 'message-close');
    looks(close, {
      'grid-area': '1 / 1',
      'justify-self': 'end',
      display: 'flex',
      'align-items': 'center',
      'justify-content': 'center',
      width: rowLine,
      height: rowLine,
      padding: '0',
      color: 'inherit',
      background: 'none',
      border: 'none',
    });
    looks(close, { background: 'var(--hover-background)' }, hovered);
  });

  test("keeps the corner of a message as wide pinned as peeked at, stacking the pin hint and the close button in one place and hiding whichever doesn't apply, so pinning doesn't change the width", () => {
    const peeked = messagePanel();
    const pinned = messagePanel({}, true);
    looks(withClass(peeked, 'message-hint'), { visibility: undefined });
    looks(withClass(peeked, 'message-close'), { visibility: 'hidden' });
    looks(withClass(pinned, 'message-hint'), { visibility: 'hidden' });
    looks(withClass(pinned, 'message-close'), { visibility: undefined });
  });

  test('cuts the rest of a message peeked at through the middle of its third line, the half line showing there is more, and shows all of it once pinned', () => {
    const rowLine = cascaded(
      withClass(rendered(commitRow()), 'commit-line'),
      'height',
    );
    looks(withClass(messagePanel(), 'message-body'), {
      'max-height': `calc(2.5 * ${rowLine})`,
      overflow: 'hidden',
    });
    looks(withClass(messagePanel({}, true), 'message-body'), {
      'max-height': undefined,
      overflow: undefined,
    });
  });

  test('tells how many lines are cut off a message peeked at in small muted type, like the hint at its corner', () => {
    const rowLine = cascaded(
      withClass(rendered(commitRow()), 'commit-line'),
      'height',
    );
    const corner = withClass(messagePanel(), 'message-corner');
    looks(rendered(createElement('div', { className: 'message-more' })), {
      'line-height': rowLine,
      color: cascaded(corner, 'color'),
      'font-size': cascaded(corner, 'font-size'),
    });
  });

  test('lets a pinned message take the pointer, its text be selected, and a long one scroll its rest alone, keeping its subject, author, bubbles and close button in place, without scrolling on past its end, its ring and shadow letting the pointer through to the row', () => {
    looks(messagePanel({}, true), {
      'pointer-events': 'auto',
      'user-select': 'text',
    });
    for (const pseudoElement of ['::before', '::after']) {
      looks(
        messagePanel({}, true),
        { 'pointer-events': 'none' },
        { pseudoElement },
      );
    }
    const pinned = messagePanel(
      { refs: [{ kind: 'branch', name: 'main', commit: 'a' }] },
      true,
    );
    looks(withClass(pinned, 'commit'), {
      display: 'flex',
      'flex-direction': 'column',
      overflow: 'hidden',
      'overflow-y': undefined,
    });
    for (const kept of ['commit-line', 'bubble-line']) {
      looks(withClass(pinned, kept), { 'flex-shrink': '0' });
    }
    looks(withClass(pinned, 'message-body'), {
      'flex-shrink': undefined,
      'min-height': '0',
      'overflow-y': 'auto',
      'overscroll-behavior': 'contain',
    });
    looks(messagePanel(), {
      'pointer-events': 'none',
      'user-select': undefined,
    });
    looks(withClass(messagePanel(), 'commit'), { display: undefined });
    looks(withClass(messagePanel(), 'message-body'), {
      'overflow-y': undefined,
    });
  });

  test("draws a commit's whole message over the edges of the columns, but under the notices and menus", () => {
    const edge = layer(
      withClass(columns(columnsClass(true, 'a'), 'commits'), 'column'),
      after,
    );
    const message = layer(messagePanel());
    assert.ok(message > edge);
    for (const above of [contextMenu(), historyMenu(), notices()]) {
      assert.ok(layer(above) > message, above.classes.join(' '));
    }
  });
});

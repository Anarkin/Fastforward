import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { plainFilter } from '../../../helpers/filters';
import { columnsClass } from '../../../../tools/git/page/columnsShown';
import { HighlightWords } from '../../../../lib/page/highlight';
import { KeyCombo } from '../../../../lib/page/keyCombo';
import {
  AboutPopupShown,
  Columns,
  ContextMenuShown,
  NoticesShown,
  SearchButtonShown,
  TabBarShown,
} from '../../../helpers/styleFixtures';
import {
  diffView,
  worktree,
  popupOf,
  scrollbarCover,
} from '../../../helpers/styleMarkup';
import { stylesheet } from '../../../helpers/pageSources';
import {
  activeEdge,
  looks,
  bodyVariable,
  hovered,
  noop,
  body,
  css,
  currentMatchOutline,
} from './stylesheetFixtures';
import { HunkDivider } from '../../../../components/diff/page/rowParts';
import { Crash } from '../../../../shell/page/errorBoundary';
import { SkeletonRows } from '../../../../lib/page/skeleton';
import { fileChange } from '../../../helpers/gitValues';
import { allWithClass, rendered, withClass } from '../../../helpers/markup';
import {
  CommitRowShown,
  FileRowShown,
  FolderRowShown,
  LocationsPopupShown,
  MessagePanelShown,
  NavButtonsShown,
  WorkingTreeRowShown,
  WorktreeBarShown,
} from '../../../helpers/styleHistoryFixtures';
import {
  DiffRow,
  DiffViewShown,
  DiffFindShown,
  FileHeaderRow,
} from '../../../helpers/styleDiffFixtures';

const inside = (classes: string, child: React.ReactNode) =>
  rendered(<div className={classes}>{child}</div>);

const found = (classes: string, current: boolean) =>
  withClass(
    inside(
      classes,
      <span className={current ? 'find-match current' : 'find-match'}>
        {'x'}
      </span>,
    ),
    'find-match',
  );

suite('Style', () => {
  test('draws the search button as every button of a bar is drawn, in its ground, its color and its size, as one in the border color with a muted icon stood apart from the buttons beside it, and draws the strip between hunks in the border color', () => {
    looks(withClass(rendered(<SearchButtonShown />), 'search-button'), {
      background: 'var(--button-background)',
      color: 'var(--color-foreground)',
      width: 'var(--button-size)',
      height: 'var(--button-size)',
    });
    looks(
      withClass(
        diffView(
          <DiffViewShown />,
          <DiffRow>
            <HunkDivider />
          </DiffRow>,
        ),
        'hunk-divider',
      ),
      { background: 'var(--color-border)' },
    );
  });

  test('rings a button or link the keyboard reached in the focus color, in whole pixels inside its edge like the active column, so nothing around it clips it, but not a menu item, which it tints instead, nor a popup taking the keyboard', () => {
    const edge = activeEdge(
      <Columns className={columnsClass(true, 'a')} active="commits" />,
    );
    assert.match(edge, /^\d+px$/);
    const ring = {
      outline: `${edge} solid var(--color-focus)`,
      'outline-offset': `-${edge}`,
    };
    const about = popupOf(<AboutPopupShown />);
    for (const control of [
      withClass(rendered(<TabBarShown />), 'tab-add'),
      withClass(rendered(<TabBarShown />), 'tab-close'),
      withClass(rendered(<NoticesShown />), 'card-close'),
      withClass(rendered(<NavButtonsShown />), 'nav-button'),
      withClass(about, 'about-copy'),
      withClass(about, 'nav-button'),
      about.children[1]?.children.find((child) => child.tag === 'a'),
    ]) {
      looks(control, ring, { focus: control });
    }
    looks(withClass(rendered(<TabBarShown />), 'tab-add'), {
      outline: undefined,
    });
    const item = withClass(rendered(<ContextMenuShown />), 'menu-item');
    looks(item, { outline: 'none' }, { focus: item });
    looks(about, { outline: 'none' }, { focus: about });
    const pinned = rendered(<MessagePanelShown pinned />);
    const close = withClass(pinned, 'message-close');
    looks(close, ring, { focus: close });
    const description = withClass(pinned, 'message-body');
    looks(pinned, { outline: 'none' }, { focus: pinned });
    looks(description, { outline: 'none' }, { focus: description });
  });

  test('tints a row under the pointer with a see-through touch of the focus color, over whatever lies under it', () => {
    assert.strictEqual(
      bodyVariable('hover-background'),
      'color-mix( in srgb, var(--color-focus) var(--color-focus-hover), transparent )',
    );
    for (const row of [
      allWithClass(rendered(<TabBarShown />), 'tab').find(
        (tab) => !tab.classes.includes('active'),
      ),
      rendered(<FileRowShown change={fileChange('src/a.ts')} />),
      rendered(<FolderRowShown />),
      rendered(<CommitRowShown />),
      rendered(<WorkingTreeRowShown count={1} />),
    ]) {
      looks(row, { background: 'var(--hover-background)' }, hovered);
    }
  });

  test('fills the search fields, the search button and the worktree chips alike, and tints them alike when hovered, the edges of the fields included', () => {
    const fields = [
      withClass(rendered(<LocationsPopupShown query="" />), 'search-box'),
    ];
    const chip = allWithClass(
      rendered(
        <WorktreeBarShown
          worktrees={[worktree('a'), worktree('b')]}
          active="/a"
        />,
      ),
      'tab',
    ).find((tab) => !tab.classes.includes('active'));
    const tinted =
      'linear-gradient(var(--hover-background), var(--hover-background)), var(--color-border)';
    for (const field of [...fields, chip]) {
      looks(field, { background: 'var(--color-border)' });
      looks(field, { background: tinted }, hovered);
    }
    for (const field of fields) {
      looks(field, { 'border-color': 'transparent' }, hovered);
    }
  });

  test('draws every scrollbar by one set of rules for the scrollbars of the browser, as wide as the scrollbar size, so no part of the app can draw its own another way: a track in the gray of a disabled button with a button at either end, the thumb and the buttons in the gray of a button, tinted as a button is under the pointer and while held, the thumb never shorter than 24 pixels, an arrow on each button in the color of an icon, a button that can scroll no further drawn as a disabled button is, its ground and its arrow both, at the end a scrollbar is scrolled to and at both of one with nothing to scroll, the ends rounded where what it scrolls says so, which what scrolls inside it never takes over from it, none of them next to the square between two scrollbars, which is filled as their tracks are', () => {
    assert.deepStrictEqual(
      Object.fromEntries(
        [
          'scrollbar-background',
          'scrollbar-track-background',
          'scrollbar-hover-background',
          'scrollbar-active-background',
          'scrollbar-arrow-color',
          'button-background',
        ].map((name) => [name, bodyVariable(name)]),
      ),
      {
        'scrollbar-background': 'var(--button-background)',
        'scrollbar-track-background':
          'color-mix( in srgb, var(--button-background) var(--color-foreground-muted), transparent )',
        'scrollbar-hover-background':
          'color-mix( in srgb, var(--color-focus) var(--color-focus-hover), var(--button-background) )',
        'scrollbar-active-background': 'var(--scrollbar-hover-background)',
        'scrollbar-arrow-color': 'var(--color-foreground)',
        'button-background': 'var(--color-border)',
      },
    );
    const rules = stylesheet().replace(/\s+/g, ' ');
    assert.doesNotMatch(rules, /--color-scrollbar/);
    for (const rule of [
      '::-webkit-scrollbar { width: var(--scrollbar-size); height: var(--scrollbar-size); background: var(--scrollbar-track-background); }',
      "@property --scrollbar-round-start { syntax: '<length>'; inherits: false; initial-value: 0px; }",
      "@property --scrollbar-round-end { syntax: '<length>'; inherits: false; initial-value: 0px; }",
      '::-webkit-scrollbar, ::-webkit-scrollbar-button { --scrollbar-round-start: inherit; --scrollbar-round-end: inherit; }',
      '::-webkit-scrollbar:vertical { border-radius: 0 var(--scrollbar-round-start, 0px) var(--scrollbar-round-end, 0px) 0; }',
      '::-webkit-scrollbar:horizontal { border-radius: 0 0 var(--scrollbar-round-end, 0px) var(--scrollbar-round-start, 0px); }',
      '::-webkit-scrollbar:vertical:corner-present, ::-webkit-scrollbar:horizontal:corner-present, ::-webkit-scrollbar-button:vertical:end:increment:corner-present, ::-webkit-scrollbar-button:horizontal:end:increment:corner-present { border-bottom-right-radius: 0; }',
      '::-webkit-scrollbar-corner { background: var(--scrollbar-track-background); }',
      '::-webkit-scrollbar-thumb { min-width: 24px; min-height: 24px; background: var(--scrollbar-background); }',
      '::-webkit-scrollbar-button { display: none; }',
      '::-webkit-scrollbar-button:start:decrement, ::-webkit-scrollbar-button:end:increment { display: block; width: var(--scrollbar-size); height: var(--scrollbar-size); background: var(--scrollbar-background) no-repeat var(--scrollbar-arrow-across) var(--scrollbar-arrow-along) / var(--scrollbar-arrow) calc(var(--scrollbar-arrow) / 2); }',
      "::-webkit-scrollbar-button:start:decrement:disabled, ::-webkit-scrollbar-button:end:increment:disabled, :not( [data-scrolled-vertical] )::-webkit-scrollbar-button:vertical:start:decrement, [data-scrolled-vertical='end']::-webkit-scrollbar-button:vertical:end:increment, :not( [data-scrolled-horizontal] )::-webkit-scrollbar-button:horizontal:start:decrement, [data-scrolled-horizontal='end']::-webkit-scrollbar-button:horizontal:end:increment { --scrollbar-arrow-color: var(--muted-foreground); background-color: var(--scrollbar-track-background); }",
      "[data-scrollbar-hover='vertical-thumb']::-webkit-scrollbar-thumb:vertical, [data-scrollbar-hover='horizontal-thumb']::-webkit-scrollbar-thumb:horizontal { background: var(--scrollbar-hover-background); }",
      "[data-scrollbar-held='vertical-thumb']::-webkit-scrollbar-thumb:vertical, [data-scrollbar-held='horizontal-thumb']::-webkit-scrollbar-thumb:horizontal { background: var(--scrollbar-active-background); }",
    ]) {
      assert.ok(rules.includes(rule), rule);
    }
    assert.strictEqual(rules.match(/::-webkit-scrollbar \{/g)?.length, 1);
    assert.strictEqual(
      rules.match(/var\(--scrollbar-arrow-color\) 90deg/g)?.length,
      4,
    );
    for (const [held, color] of [
      ['hover', 'hover'],
      ['held', 'active'],
    ]) {
      assert.ok(
        rules.includes(
          `[data-scrollbar-${held}='horizontal-end']::-webkit-scrollbar-button:horizontal:increment:enabled { background-color: var(--scrollbar-${color}-background); }`,
        ),
        held,
      );
    }
    assert.ok(
      rules.indexOf('::-webkit-scrollbar-button:start:decrement:disabled') >
        rules.indexOf("[data-scrollbar-held='horizontal-end']"),
    );
  });

  test('fills the square between the scrollbar beside a text and the one below it as their tracks are, in the viewer, the editor and the diff alike while their lines are not wrapped, inside the lines of their column and rounded with its corner, and draws none once they are wrapped and have no scrollbar below, as the square stood empty, a hole in the corner of the two', () => {
    const square = {
      content: "''",
      position: 'absolute',
      right: 'var(--line-right, 0px)',
      bottom: 'var(--line-below, 0px)',
      width: 'var(--scrollbar-size)',
      height: 'var(--scrollbar-size)',
      background: 'var(--scrollbar-track-background)',
      'border-bottom-right-radius': 'var(--corner-round, 0px)',
      'pointer-events': 'none',
    };
    const none = { background: undefined, width: undefined };
    for (const [unwrapped, wrapped, pseudoElement] of [
      [
        <div key="viewer" className="viewer-body" />,
        <div key="viewer" className="viewer-body wrapped" />,
        '::after',
      ],
      [
        <div key="editor" className="cm-editor editor-text">
          <div className="cm-content" />
        </div>,
        <div key="editor" className="cm-editor editor-text">
          <div className="cm-content cm-lineWrapping" />
        </div>,
        '::after',
      ],
      [
        <div key="diff" className="diff-view" />,
        <div key="diff" className="diff-view wrap" />,
        '::before',
      ],
    ] as const) {
      looks(rendered(unwrapped), square, { pseudoElement });
      looks(rendered(wrapped), none, { pseudoElement });
    }
  });

  test('fits a scrollbar to what it stands in where that is no panel: the track of the one of a long notice tinted from the text of the notice rather than drawn in the border color, which stood as a dark strip in it, and the ends of the one below a block of code in Markdown rounded as the block is', () => {
    looks(withClass(rendered(<NoticesShown />), 'card-message'), {
      '--scrollbar-track-background':
        'color-mix( in srgb, var(--color-foreground) 10%, transparent )',
    });
    const code = withClass(
      rendered(
        <div className="markdown">
          <pre className="block" />
        </div>,
      ),
      'block',
    );
    looks(code, {
      'border-radius': 'var(--radius)',
      '--scrollbar-round-start': 'var(--radius)',
      '--scrollbar-round-end': 'var(--radius)',
    });
  });

  test('lets any menu marked as scrolling scroll down, the one of a button as the one opened at the pointer, which alone may be as tall as the window', () => {
    const rules = stylesheet().replace(/\s+/g, ' ');
    assert.ok(
      rules.includes(
        '.menu.scrolls { box-sizing: border-box; overflow-y: auto; }',
      ),
    );
    assert.ok(
      rules.includes('.menu.context-menu.scrolls { max-height: 100vh; }'),
    );
  });

  test('names the buttons of a scrollbar by where they stand and which way they move, the one before the track that moves back and the one after it that moves on, never as a single or a double button, which the browser matches only where the scrollbars of the system have buttons, so macOS, whose own have none, drew no button at all', () => {
    const rules = stylesheet().replace(/\s+/g, ' ');
    assert.doesNotMatch(rules, /:single-button|:double-button/);
    for (const [axis, start, end] of [
      ['vertical', 'top-right', 'bottom-right'],
      ['horizontal', 'bottom-left', 'bottom-right'],
    ]) {
      for (const [button, corner, round] of [
        ['start:decrement', start, 'start'],
        ['end:increment', end, 'end'],
      ]) {
        assert.match(
          rules,
          new RegExp(
            `::-webkit-scrollbar-button:${axis}:${button} \\{ background-image: conic-gradient\\(`,
          ),
          `${axis} ${button}`,
        );
        assert.ok(
          rules.includes(
            `::-webkit-scrollbar-button:${axis}:${button} { border-${corner}-radius: var(--scrollbar-round-${round}, 0px); }`,
          ),
          `${axis} ${button} rounded`,
        );
      }
    }
  });

  test('takes the presses on a scrollbar with a cover the page lays over it, seen by nothing, shown only over the scrollbar the pointer is at', () => {
    looks(scrollbarCover(), { position: 'fixed', display: 'none' });
    looks(scrollbarCover('shown'), { display: 'block' });
    looks(scrollbarCover('shown'), { background: undefined });
  });

  test('tints a selected row and the active search result alike, with the focus color', () => {
    assert.strictEqual(
      bodyVariable('selection-background'),
      'color-mix( in srgb, var(--color-focus) var(--color-focus-selected), var(--color-panel-background) )',
    );
    for (const row of [
      rendered(<FileRowShown change={fileChange('src/a.ts')} chosen />),
      rendered(<CommitRowShown selected="a" />),
      withClass(
        rendered(<LocationsPopupShown query="m" />),
        'row',
        'result',
        'active',
      ),
    ]) {
      for (const states of [{}, hovered]) {
        looks(row, { background: 'var(--selection-background)' }, states);
      }
    }
  });

  test('paints the color of the panel behind every list and preview that scrolls in a column, so the text in it keeps ClearType where Chromium composites a scrolling area, from 150% on', () => {
    for (const scroller of [
      rendered(<div className="virtual-rows" />),
      rendered(<div className="column-body viewer-body viewer-preview" />),
    ]) {
      looks(scroller, { background: 'var(--color-panel-background)' });
    }
  });

  test('marks every match of a search in the colors of a match as a plain rectangle, as the cursor is one, outlining the current one, in the editor, the viewer, the diff, PDFs, the commander, the commits, the files, the locations and the shortcuts, and what the editor marks on its own, a bracket it matches and the occurrences of the word at the cursor or of the text selected, as a plain rectangle too, in that yellow at the share the theme gives such marks', () => {
    const match = {
      color: 'var(--color-search-match-foreground)',
      background: 'var(--color-search-match)',
      'border-radius': undefined,
    };
    for (const classes of [
      'cm-editor editor-text',
      'viewer-row',
      'diff-line',
    ]) {
      looks(found(classes, false), { ...match, 'box-shadow': undefined });
      looks(found(classes, true), {
        ...match,
        'box-shadow': currentMatchOutline,
      });
    }
    for (const classes of [
      'row commander-row',
      'commit',
      'row tree-row',
      'locations-list',
      'shortcuts-popup',
      'menu filtered-menu',
    ]) {
      looks(
        withClass(
          inside(
            classes,
            <HighlightWords text="x" filter={plainFilter('x')} />,
          ),
          'match',
        ),
        match,
      );
    }
    looks(
      withClass(
        inside(
          'shortcuts-popup',
          <KeyCombo keys="F1" matched={new Set(['f1'])} />,
        ),
        'match',
      ),
      match,
    );
    for (const classes of [
      'highlight',
      'highlight begin',
      'highlight end',
      'highlight selected',
    ]) {
      looks(
        withClass(
          inside(
            'pdf-pane',
            <div className="textLayer">
              <span className={classes}>x</span>
            </div>,
          ),
          ...classes.split(' '),
        ),
        {
          '--highlight-bg-color': 'var(--color-search-match)',
          'border-radius': '0',
        },
      );
    }
    for (const implicit of ['cm-matchingBracket', 'occurrence-match']) {
      looks(
        withClass(
          inside(
            'cm-editor editor-text cm-focused',
            <span className={implicit}>(</span>,
          ),
          implicit,
        ),
        {
          background:
            'color-mix( in srgb, var(--color-search-match) var(--color-search-match-implicit), transparent )',
          'border-radius': undefined,
        },
      );
    }
  });

  test('selects text in the color of a selected row everywhere, in the text boxes, the viewer, the diff, Markdown and any other text as the editor does, and see-through in that color over the page of a PDF, which shows through', () => {
    const selected = { pseudoElement: '::selection' };
    const text = <span className="text">x</span>;
    for (const element of [
      rendered(<input className="prompt-input" />),
      rendered(<textarea className="field" />),
      withClass(inside('viewer-row', text), 'text'),
      withClass(inside('diff-line', text), 'text'),
      withClass(inside('markdown', text), 'text'),
      withClass(inside('notice', text), 'text'),
    ]) {
      looks(
        element,
        { 'background-color': 'var(--selection-background)' },
        selected,
      );
    }
    const editor = rendered(
      <div className="cm-editor editor-text editor-selection">
        <div className="cm-scroller">
          <div className="cm-line">x</div>
          <div className="cm-selectionLayer">
            <div className="cm-selectionBackground" />
          </div>
        </div>
      </div>,
    );
    looks(
      withClass(editor, 'cm-line'),
      { 'background-color': 'transparent' },
      selected,
    );
    looks(withClass(editor, 'cm-selectionBackground'), {
      background: 'var(--selection-background)',
    });
    looks(
      withClass(
        inside('pdf-pane', <div className="textLayer">{text}</div>),
        'text',
      ),
      { 'background-color': 'var(--selection-tint)' },
      selected,
    );
    assert.strictEqual(
      bodyVariable('selection-tint'),
      'color-mix( in srgb, var(--color-focus) var(--color-focus-selected), transparent )',
    );
  });

  test('lets only the diff, errors and notices be selected, not the controls around them', () => {
    looks(body, { 'user-select': 'none' });
    const view = diffView(<DiffViewShown />, <FileHeaderRow />);
    for (const selectable of [
      view,
      withClass(rendered(<NoticesShown />), 'card-message'),
      withClass(
        rendered(
          <Crash
            title="Fastforward"
            error={new Error('boom')}
            onReload={noop}
            listen={() => noop}
            onQuit={noop}
          />,
        ),
        'error-message',
      ),
    ]) {
      looks(selectable, { 'user-select': 'text' });
    }
    looks(withClass(view, 'file-header'), { 'user-select': 'none' });
  });

  test('sizes all text by the font size settings, or a multiple of them for the headings of Markdown, buttons and inputs included', () => {
    const sizes = [...css.matchAll(/font-size: ([^;]+);/g)].map(
      (match) => match[1],
    );
    assert.deepStrictEqual(
      [...new Set(sizes.filter((size) => !size.startsWith('calc(')))],
      ['var(--font-size)', 'var(--monospace-font-size)'],
    );
    for (const scaled of sizes.filter((size) => size.startsWith('calc('))) {
      assert.match(scaled, /^calc\(var\(--font-size\) \* [\d.]+\)$/);
    }
    const controls = [
      rendered(<TabBarShown />),
      rendered(<ContextMenuShown />),
      rendered(<LocationsPopupShown query="" />),
      rendered(<DiffFindShown />),
      rendered(<NoticesShown />),
      rendered(<SearchButtonShown />),
      rendered(<NavButtonsShown />),
    ].flatMap((root) =>
      allWithClass(root).filter((element) =>
        ['button', 'input'].includes(element.tag),
      ),
    );
    assert.ok(controls.length > 10);
    for (const control of controls) {
      looks(control, { font: 'inherit' });
    }
  });

  test('keeps the arrow cursor of a desktop app but for resizing and over the text drawn as cells, which the browser takes for no text and shows no text cursor over by itself, the fields and the text of elements showing the text cursor of their own', () => {
    assert.deepStrictEqual(
      [
        ...new Set(
          [...css.matchAll(/cursor: ([^;]+);/g)].map((match) => match[1]),
        ),
      ].toSorted(),
      ['col-resize', 'text'],
    );
    assert.deepStrictEqual(
      [...css.matchAll(/([^{}]+)\{[^{}]*cursor: text;/g)].map((match) =>
        match[1].trim(),
      ),
      ['.cell-canvas'],
    );
  });

  test('mutes text by the one muted opacity, from the text color', () => {
    assert.strictEqual(
      bodyVariable('muted-opacity'),
      'var(--color-foreground-muted)',
    );
    assert.strictEqual(
      bodyVariable('muted-foreground'),
      'color-mix( in srgb, var(--color-foreground) var(--color-foreground-muted), transparent )',
    );
    looks(withClass(rendered(<CommitRowShown />), 'commit-line', 'secondary'), {
      color: 'var(--muted-foreground)',
    });
  });

  test('dims close buttons, disabled controls and a gone bubble like muted text, keeping its own fade only for the loading placeholder', () => {
    for (const dimmed of [
      withClass(rendered(<NoticesShown />), 'card-close'),
      withClass(rendered(<LocationsPopupShown query="" />), 'badge', 'missing'),
      allWithClass(rendered(<ContextMenuShown />), 'menu-item').find((item) =>
        item.attributes.has('disabled'),
      ),
      allWithClass(rendered(<NavButtonsShown />), 'nav-button').find((button) =>
        button.attributes.has('disabled'),
      ),
    ]) {
      looks(dimmed, { opacity: 'var(--muted-opacity)' });
    }
    const fades = [...css.matchAll(/opacity: (0\.\d+);/g)].map(
      (match) => match[1],
    );
    assert.strictEqual(fades.length, 1);
    looks(
      withClass(
        withClass(rendered(<SkeletonRows count={1} />), 'skeleton-row'),
        'bar',
      ),
      { opacity: fades[0] },
    );
  });
});

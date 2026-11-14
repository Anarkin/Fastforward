import * as assert from 'node:assert';
import { createElement } from 'react';
import { suite, test } from 'vitest';
import { CopyButton } from '../../../../shell/page/aboutPopup';
import {
  ShortcutsList,
  shownEntries,
} from '../../../../shell/page/shortcutsPopup';
import { shortcutEntries } from '../../../../shell/page/tools';
import {
  allWithClass,
  cascaded,
  matchingRules,
  rendered,
  withClass,
} from '../../../support/cascade';
import {
  contextMenu,
  historyMenu,
  notices,
} from '../../../support/styleFixtures';
import {
  noop,
  looks,
  bodyVariable,
  sidesOf,
  paddingOf,
  layer,
  hovered,
  after,
  commitColumnTitle,
  aboutPopup,
  shortcutsPopup,
  overlayScrollbar,
  keyOf,
  widthCap,
} from './stylesheetFixtures';

suite('Style', () => {
  test('places the shortcuts and the About by layout rather than a transform, which would place their edges between device pixels, a third of the room left above them and two thirds below, as a popup centered looks low, drawing the About like the shortcuts but narrower', () => {
    for (const popup of [shortcutsPopup(), aboutPopup()]) {
      const dialog = withClass(popup, 'shortcuts-popup');
      looks(dialog, {
        transform: undefined,
        translate: undefined,
        position: undefined,
        flex: 'none',
        'max-height': '100%',
      });
      const backdrop = dialog?.parent;
      assert.ok(backdrop);
      looks(backdrop, {
        display: 'flex',
        'flex-direction': 'column',
        'align-items': 'center',
        'box-sizing': 'border-box',
      });
      const before = { pseudoElement: '::before' };
      looks(backdrop, { content: "''" }, before);
      looks(backdrop, { content: "''" }, after);
      assert.strictEqual(
        Number(cascaded(backdrop, 'flex-grow', after)),
        2 * Number(cascaded(backdrop, 'flex-grow', before)),
      );
    }
    const shortcuts = widthCap(withClass(shortcutsPopup(), 'shortcuts-popup'));
    const about = widthCap(withClass(aboutPopup(), 'about-popup'));
    assert.strictEqual(about.room, shortcuts.room);
    assert.ok(about.cap < shortcuts.cap);
  });

  test('dims the whole window behind the shortcuts and the About with a backdrop that takes the pointer from the app, under them', () => {
    for (const popup of [shortcutsPopup(), aboutPopup()]) {
      const backdrop = popup.parent;
      assert.ok(backdrop?.classes.includes('backdrop'));
      looks(backdrop, {
        position: 'fixed',
        inset: '0',
        background: 'var(--backdrop)',
        'pointer-events': undefined,
      });
    }
    assert.strictEqual(bodyVariable('backdrop'), 'rgba(0, 0, 0, 0.2)');
  });

  test('keeps the shortcuts and the About from dragging the window when moved over the tab row, which does', () => {
    for (const popup of [shortcutsPopup(), aboutPopup()]) {
      looks(withClass(popup, 'shortcuts-popup'), {
        '-webkit-app-region': 'no-drag',
      });
    }
  });

  test("heads the shortcuts and the About with a band in the window's grey, holding their title in line with the filter below it and their close button as far in from the side as from the top, rounded with the popup's top corners, the About's body padded at the sides as the filter is", () => {
    const filter = withClass(shortcutsPopup(), 'shortcuts-filter');
    looks(filter, { padding: '8px 16px' });
    const inside = paddingOf(filter);
    for (const popup of [shortcutsPopup(), aboutPopup()]) {
      const header = withClass(popup, 'shortcuts-title');
      looks(header, {
        background: 'var(--color-background)',
        'border-radius': 'var(--card-radius) var(--card-radius) 0 0',
      });
      const padding = paddingOf(header);
      assert.strictEqual(padding.left, inside.left);
      assert.deepStrictEqual(
        [padding.right, padding.bottom],
        [padding.top, padding.top],
      );
      assert.ok(withClass(header, 'nav-button'));
    }
    const aboutBody = paddingOf(withClass(aboutPopup(), 'about-body'));
    assert.deepStrictEqual(
      [aboutBody.left, aboutBody.right],
      [inside.left, inside.right],
    );
  });

  test('lays the tools out in a column beside the shortcuts, each scrolling on its own, in a popup of a set height, so it keeps its size from tool to tool, and the filter, set apart above them, in the field the files column uses', () => {
    const popup = shortcutsPopup();
    assert.match(
      cascaded(withClass(popup, 'shortcuts-window'), 'height') ?? '',
      /^\d+px$/,
    );
    looks(withClass(popup, 'shortcuts-filter'), {
      flex: 'none',
      display: 'flex',
      '--search-height': 'var(--button-size)',
      'border-bottom': '1px solid var(--color-border)',
    });
    looks(withClass(popup, 'search-field'), { flex: '1' });
    looks(withClass(popup, 'shortcuts-main'), {
      flex: '1',
      'min-height': '0',
      display: 'grid',
    });
    assert.match(
      cascaded(withClass(popup, 'shortcuts-main'), 'grid-template-columns') ??
        '',
      /^\d+px minmax\(0, 1fr\)$/,
    );
    looks(withClass(popup, 'shortcuts-tree'), {
      'overflow-y': 'auto',
      'border-right': '1px solid var(--color-border)',
    });
    looks(withClass(popup, 'shortcuts-pane'), {
      position: 'relative',
      'overflow-y': 'auto',
      columns: undefined,
    });
  });

  test("keeps the heading of the group scrolled under it at the top of the pane, over the shortcuts passing beneath it, a hairline short of the popup's edge, whose line the popup's inset shadow draws under it", () => {
    looks(withClass(shortcutsPopup(), 'shortcuts-main'), {
      'margin-right': 'var(--hairline)',
    });
    const heading = withClass(shortcutsPopup(), 'shortcuts-heading');
    looks(heading, {
      position: 'sticky',
      top: '0',
      background: 'var(--color-panel-background)',
      'font-weight': '700',
    });
    const reach = sidesOf(heading, 'margin');
    const room = paddingOf(withClass(shortcutsPopup(), 'shortcuts-pane'));
    assert.deepStrictEqual(
      [reach.left, reach.right],
      [`-${room.left}`, `-${room.right}`],
    );
  });

  test('leaves as much room under the last shortcut of a group as over the heading of the next, the line between them halfway', () => {
    const popup = shortcutsPopup();
    const under =
      Number.parseFloat(paddingOf(withClass(popup, 'shortcuts-group')).bottom) +
      Number.parseFloat(paddingOf(withClass(popup, 'shortcut-row')).bottom);
    assert.strictEqual(
      under,
      Number.parseFloat(paddingOf(withClass(popup, 'shortcuts-heading')).top),
    );
  });

  test('fills the tool open as the selected row of a list, the others tinted under the pointer, and marks the group in view by a line in the color of focus beside its name, the others muted, dimming what has no match', () => {
    const popup = shortcutsPopup();
    looks(withClass(popup, 'shortcuts-tool', 'open'), {
      background: 'var(--selection-background)',
    });
    const closed = allWithClass(popup, 'shortcuts-tool').find(
      (tool) => !tool.classes.includes('open'),
    );
    assert.ok(closed);
    looks(closed, { background: 'none' });
    looks(closed, { background: 'var(--hover-background)' }, hovered);
    looks(withClass(popup, 'shortcuts-group-link', 'in-view'), {
      color: 'var(--color-foreground)',
      'border-left-color': 'var(--color-focus)',
    });
    const other = allWithClass(popup, 'shortcuts-group-link').find(
      (link) => !link.classes.includes('in-view'),
    );
    assert.ok(other);
    looks(other, {
      color: 'var(--muted-foreground)',
      'border-left': '2px solid transparent',
    });
    for (const className of ['shortcuts-tool empty', 'shortcuts-group-link']) {
      const dimmed = withClass(
        rendered(
          createElement(
            'div',
            { className: 'shortcuts-popup' },
            createElement('button', { className, disabled: true }),
          ),
        ),
        className.split(' ')[0] ?? '',
      );
      looks(dimmed, { opacity: 'var(--muted-opacity)' });
    }
  });

  test('draws a shortcut as one key cap holding its keys, split by a line in the color of its edge, the plus kept for reading aloud and copying but not drawn, and the mouse of a part done with it muted', () => {
    const popup = shortcutsPopup();
    const combo = withClass(popup, 'shortcut-combo');
    looks(combo, {
      display: 'inline-flex',
      'white-space': 'nowrap',
      border: '1px solid var(--color-border)',
      'border-bottom-width': '2px',
      'border-radius': '4px',
    });
    const key = keyOf(combo);
    assert.ok(key);
    looks(key, { border: undefined, padding: '0 5px' });
    looks(withClass(combo, 'shortcut-joiner'), {
      'align-self': 'stretch',
      width: 'var(--hairline)',
      'min-width': '0',
      overflow: 'hidden',
      color: 'transparent',
      background: 'var(--color-border)',
    });
    looks(withClass(popup, 'mouse-icon'), {
      color: 'var(--muted-foreground)',
      'vertical-align': 'middle',
    });
  });

  test('marks what the filter found in a shortcut, words and keys alike, in the colors of a search match', () => {
    const commander = shownEntries(shortcutEntries, 'rename f6').find(
      (entry) => entry.id === 'commander',
    );
    assert.ok(commander);
    const list = rendered(
      createElement(
        'div',
        { className: 'shortcuts-popup' },
        createElement(ShortcutsList, { entry: commander }),
      ),
    );
    for (const found of allWithClass(list, 'match')) {
      looks(found, {
        color: 'var(--color-search-match-foreground)',
        background: 'var(--color-search-match)',
      });
    }
    assert.deepStrictEqual(
      allWithClass(list, 'match').map((found) => found.tag),
      ['kbd', 'mark'],
    );
  });

  test("paints the About's copy button as the default button of a dialog, in the color of focus hovered, pressed or once it copied, and tinted inside the outline of focus while focused from the keyboard", () => {
    const copy = withClass(aboutPopup(), 'about-copy');
    const filled = {
      color: 'var(--color-focus-foreground)',
      background: 'var(--color-focus)',
    };
    looks(copy, filled);
    looks(copy, filled, hovered);
    looks(copy, filled, { active: true });
    const copied = withClass(
      rendered(createElement(CopyButton, { copied: true, onClick: noop })),
      'about-copy',
    );
    looks(copied, filled);
    for (const button of [copy, copied]) {
      looks(
        button,
        { color: 'inherit', background: 'var(--selection-background)' },
        { focus: button },
      );
    }
  });

  test('keeps the notices within the window, scrolling a long message within its notice, so a checkout listing hundreds of files leaves its close button in reach', () => {
    const shown = notices();
    looks(withClass(shown, 'notices'), {
      'box-sizing': 'border-box',
      bottom: '0',
      'overflow-y': 'auto',
    });
    const message = withClass(shown, 'notice-message');
    looks(message, { 'overflow-y': 'auto' });
    assert.ok(cascaded(message, 'max-height'));
  });

  test('draws a notice like a context menu, but on a background of its own, so it stands apart from the panels it floats over, and with twice the room around its message, as it is read rather than scanned', () => {
    const menu = contextMenu();
    for (const level of ['info', 'error']) {
      const shown = notices(level);
      looks(
        withClass(shown, 'notice'),
        Object.fromEntries(
          ['border-radius', 'box-shadow'].map((property) => [
            property,
            cascaded(menu, property),
          ]),
        ),
      );
      looks(withClass(shown, 'notice'), {
        background: 'var(--color-notice-background)',
        padding: `${2 * parseFloat(cascaded(menu, 'padding') ?? '')}px`,
        border: undefined,
        'border-left': undefined,
      });
      looks(withClass(shown, 'notice-message'), {
        padding: '6px 0 6px 12px',
      });
    }
  });

  test("sets a notice's close button in as far as the message's first line, as it is shorter than the message's padding and line", () => {
    const shown = notices();
    const message = withClass(shown, 'notice-message');
    const close = withClass(shown, 'notice-close');
    assert.ok(message && close);
    const marginTop = (cascaded(close, 'margin') ?? '0').split(' ')[0];
    assert.strictEqual(
      Number.parseInt(marginTop) + 2,
      Number.parseInt(paddingOf(message).top),
    );
    looks(close, { height: '20px' });
  });

  test('puts the notices in the bottom right corner, below the column titles or the text saying no repository is open, so they hide nothing being worked on in the middle', () => {
    looks(withClass(notices(), 'notices'), {
      position: 'fixed',
      top: 'anchor(--notices bottom, 0px)',
      left: '0',
      right: '0',
      'flex-direction': 'column',
      'justify-content': 'safe flex-end',
      'align-items': 'flex-end',
    });
    looks(withClass(notices(), 'notice'), { 'box-sizing': 'border-box' });
    assert.ok(cascaded(withClass(notices(), 'notice'), 'max-width'));
    for (const anchor of [
      commitColumnTitle(0),
      rendered(createElement('div', { className: 'empty-state' })),
    ]) {
      looks(anchor, { 'anchor-name': '--notices' });
    }
  });

  test('pads the notices for the shadow of a popup, which their scrolling would clip, keeping them 16px from the bottom of the window', () => {
    const shadows = [
      ...(bodyVariable('popup-shadow') ?? '').matchAll(
        /(?<!inset )0 (\d+)px (\d+)px rgba/g,
      ),
    ].map(([, y, blur]) => ({ y: Number(y), blur: Number(blur) }));
    assert.ok(shadows.length > 0);
    const container = withClass(notices(), 'notices');
    assert.ok(container);
    const padding = paddingOf(container);
    assert.ok(
      Number.parseInt(padding.top) >=
        Math.max(...shadows.map((s) => s.blur - s.y)),
    );
    for (const side of [padding.left, padding.right]) {
      assert.ok(
        Number.parseInt(side) >= Math.max(...shadows.map((s) => s.blur)),
      );
    }
    assert.strictEqual(padding.bottom, '16px');
  });

  test('draws an error notice like any other notice but for an icon of an error in the error color before its message, the message in the color of any text, as red text on the background of a notice was hard to read', () => {
    assert.deepStrictEqual(
      matchingRules(withClass(notices(), 'notice')).map(
        (rule) => rule.selector,
      ),
      ['.notice'],
    );
    for (const level of ['info', 'error']) {
      looks(withClass(notices(level), 'notice-message'), { color: undefined });
    }
    looks(withClass(notices(), 'error-icon'), {
      flex: 'none',
      color: 'var(--color-error-foreground)',
    });
    assert.deepStrictEqual(allWithClass(notices('info'), 'error-icon'), []);
  });

  test('lines the actions of every shortcut up after a column of keys of one width, wrapping a long list of keys', () => {
    const rows = allWithClass(shortcutsPopup(), 'shortcut-row');
    const share = cascaded(rows[0], 'grid-template-columns');
    assert.match(share ?? '', /^minmax\(\d+px, [\d.]+%\) minmax\(0, 1fr\)$/);
    for (const row of rows) {
      looks(row, { 'grid-template-columns': share });
    }
    for (const keys of allWithClass(shortcutsPopup(), 'shortcut-keys')) {
      looks(keys, { 'flex-wrap': 'wrap' });
    }
  });

  test('sets the note about moving through the shortcuts by keys apart under them, muted, kept in view as they scroll', () => {
    looks(withClass(shortcutsPopup(), 'shortcuts-note'), {
      flex: 'none',
      color: 'var(--muted-foreground)',
      'border-top': '1px solid var(--color-border)',
    });
  });

  test('draws the shortcuts over the notices and menus, but under the overlay scrollbars', () => {
    const backdrop = shortcutsPopup().parent;
    assert.ok(backdrop);
    const shortcuts = layer(backdrop);
    for (const below of [contextMenu(), historyMenu(), notices()]) {
      assert.ok(shortcuts > layer(below), below.classes.join(' '));
    }
    assert.ok(layer(overlayScrollbar()) > shortcuts);
  });
});

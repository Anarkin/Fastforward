import { layerOver } from '../../../../lib/page/scrollbars';
import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { plainFilter } from '../../../helpers/filters';
import { CopyButton } from '../../../../shell/page/aboutPopup';
import { shownEntries } from '../../../../shell/page/shortcutsList';
import { ShortcutsList } from '../../../../shell/page/shortcutsPopup';
import { shortcutEntries } from '../../../../shell/page/toolShortcuts';
import { cascaded } from '../../../helpers/cascade';
import {
  AboutPopupShown,
  ContextMenuShown,
  NoticesShown,
  ShortcutsPopupShown,
} from '../../../helpers/styleFixtures';
import {
  noop,
  looks,
  bodyVariable,
  sidesOf,
  paddingOf,
  layer,
  hovered,
  after,
  unwrapped,
} from './stylesheetFixtures';
import { keyOf, popupOf } from '../../../helpers/styleMarkup';
import {
  allWithClass,
  rendered,
  withClass,
  type MarkupElement,
} from '../../../helpers/markup';
import { HistoryMenuShown } from '../../../helpers/styleHistoryFixtures';

function widthCap(popup: MarkupElement): { cap: number; room: string } {
  const width = /^min\(([\d.]+)px, (.+)\)$/.exec(
    cascaded(popup, 'width') ?? '',
  );
  assert.ok(width);
  return { cap: Number(width[1]), room: width[2] };
}

suite('Style', () => {
  test('places the shortcuts and the About by layout rather than a transform, which would place their edges between device pixels, a third of the room left above them and two thirds below, as a popup centered looks low, drawing the About like the shortcuts but narrower', () => {
    for (const popup of [
      popupOf(<ShortcutsPopupShown />),
      popupOf(<AboutPopupShown />),
    ]) {
      const dialog = withClass(popup, 'shortcuts-popup');
      looks(dialog, {
        transform: undefined,
        translate: undefined,
        position: 'relative',
        inset: undefined,
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
    const shortcuts = widthCap(
      withClass(popupOf(<ShortcutsPopupShown />), 'shortcuts-popup'),
    );
    const about = widthCap(
      withClass(popupOf(<AboutPopupShown />), 'about-popup'),
    );
    assert.strictEqual(about.room, shortcuts.room);
    assert.ok(about.cap < shortcuts.cap);
  });

  test('dims the whole window behind the shortcuts and the About with a backdrop that takes the pointer from the app, under them', () => {
    for (const popup of [
      popupOf(<ShortcutsPopupShown />),
      popupOf(<AboutPopupShown />),
    ]) {
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
    for (const popup of [
      popupOf(<ShortcutsPopupShown />),
      popupOf(<AboutPopupShown />),
    ]) {
      looks(withClass(popup, 'shortcuts-popup'), {
        '-webkit-app-region': 'no-drag',
      });
    }
  });

  test("heads the shortcuts and the About with a band in the window's grey, holding their title in line with the filter below it and their close button as far in from the side as from the top, rounded with the popup's top corners, the About's body padded at the sides as the filter is", () => {
    const filter = withClass(
      popupOf(<ShortcutsPopupShown />),
      'shortcuts-filter',
    );
    looks(filter, { padding: '8px 16px' });
    const inside = paddingOf(filter);
    for (const popup of [
      popupOf(<ShortcutsPopupShown />),
      popupOf(<AboutPopupShown />),
    ]) {
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
    const aboutBody = paddingOf(
      withClass(popupOf(<AboutPopupShown />), 'about-body'),
    );
    assert.deepStrictEqual(
      [aboutBody.left, aboutBody.right],
      [inside.left, inside.right],
    );
  });

  test('lays the tools out in a column beside the shortcuts, each scrolling on its own, in a popup of a set height, so it keeps its size from tool to tool, and the filter, set apart above them, in the field the files column uses', () => {
    const popup = popupOf(<ShortcutsPopupShown />);
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
    looks(withClass(popup, 'search-bar'), { flex: '1' });
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

  test("keeps the heading of the group scrolled under it at the top of the pane, over the shortcuts passing beneath it, up to the popup's edge, whose line the popup draws over it", () => {
    looks(withClass(popupOf(<ShortcutsPopupShown />), 'shortcuts-main'), {
      'margin-right': undefined,
    });
    const heading = withClass(
      popupOf(<ShortcutsPopupShown />),
      'shortcuts-heading',
    );
    looks(heading, {
      position: 'sticky',
      top: '0',
      background: 'var(--color-panel-background)',
      'font-weight': '700',
    });
    const reach = sidesOf(heading, 'margin');
    const room = paddingOf(
      withClass(popupOf(<ShortcutsPopupShown />), 'shortcuts-pane'),
    );
    assert.deepStrictEqual(
      [reach.left, reach.right],
      [`-${room.left}`, `-${room.right}`],
    );
  });

  test('lays the shortcuts on lines of the row height, so the pane comes to rest on a line wherever it stops: a heading three lines, its words between a blank line over and under them, the first heading too, with no line drawn between the groups, each shortcut as many as it wraps to, and the heading stuck at the top its three lines of cover', () => {
    const popup = popupOf(<ShortcutsPopupShown />);
    const line = 'var(--row-line-height)';
    looks(withClass(popup, 'shortcuts-pane'), {
      'line-height': line,
      'scroll-padding-top': `calc(3 * ${line})`,
    });
    const headings = allWithClass(popup, 'shortcuts-heading');
    assert.ok(headings.length > 1);
    for (const heading of headings) {
      looks(heading, {
        padding: `${line} 16px`,
        'box-shadow': undefined,
      });
    }
    looks(withClass(popup, 'shortcuts-group'), { padding: undefined });
    looks(withClass(popup, 'shortcut-row'), {
      'align-items': 'start',
      padding: '0',
      gap: '0 16px',
    });
    looks(withClass(popup, 'shortcut-keys'), { gap: '0 6px' });
  });

  test('draws the icon of every tool beside its shortcuts in its own color, as the theme gives each tool one', () => {
    const popup = popupOf(<ShortcutsPopupShown />);
    for (const tool of [
      'terminal',
      'commander',
      'git',
      'viewer',
      'diff',
      'editor',
    ]) {
      looks(withClass(popup, `tool-${tool}`), {
        color: `var(--color-${tool}-icon)`,
      });
    }
  });

  test('lays the tools and their groups on lines of the row height too, with no room between them, and their lines drawn without taking room', () => {
    const popup = popupOf(<ShortcutsPopupShown />);
    const line = 'var(--row-line-height)';
    looks(withClass(popup, 'shortcuts-tree'), {
      gap: '0',
      'line-height': line,
    });
    looks(withClass(popup, 'shortcuts-tool'), { padding: '0 8px' });
    looks(withClass(popup, 'shortcuts-groups'), {
      margin: '0 0 0 23px',
      border: undefined,
      'box-shadow': 'inset var(--hairline) 0 var(--color-border)',
    });
    looks(withClass(popup, 'shortcuts-group-link'), {
      padding: '0 8px',
      border: 'none',
    });
  });

  test('fills the tool open as the selected row of a list, the others tinted under the pointer, and marks the group in view by a line in the color of focus beside its name alone, not in bold, tinted under the pointer too as it takes a click, the others in the color of the text and tinted under the pointer as the tools are, rounded on the right alone so the line stays straight, dimming what has no match', () => {
    const popup = popupOf(<ShortcutsPopupShown />);
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
      'font-weight': undefined,
      'box-shadow': 'inset 2px 0 var(--color-focus)',
    });
    looks(
      withClass(popup, 'shortcuts-group-link', 'in-view'),
      { background: 'var(--hover-background)' },
      hovered,
    );
    const other = allWithClass(popup, 'shortcuts-group-link').find(
      (link) => !link.classes.includes('in-view'),
    );
    assert.ok(other);
    looks(other, {
      color: 'inherit',
      'box-shadow': undefined,
      'border-radius': '0 4px 4px 0',
    });
    looks(other, { background: 'var(--hover-background)' }, hovered);
    for (const className of ['shortcuts-tool empty', 'shortcuts-group-link']) {
      const dimmed = withClass(
        rendered(
          <div className="shortcuts-popup">
            <button className={className} disabled />
          </div>,
        ),
        className.split(' ')[0] ?? '',
      );
      looks(dimmed, { opacity: 'var(--muted-opacity)' });
    }
  });

  test('draws a shortcut as one key cap on a ground a little dimmer than a panel, between it and the color of its edge, so it is a key on a panel and on the row of a menu under the pointer alike, holding its keys inside its line, two pixels short of it and centered, its keys on the line of the words beside it, its edge drawn without taking room, split by a line in the color of its edge, the plus kept for reading aloud and copying but not drawn, and the mouse of a part done with it muted, its middle on the middle of the capitals of its key rather than of its small letters, where it stood low', () => {
    const popup = popupOf(<ShortcutsPopupShown />);
    const combo = withClass(popup, 'shortcut-combo');
    looks(combo, {
      display: 'inline-flex',
      'white-space': 'nowrap',
      'box-sizing': 'border-box',
      height: 'calc(var(--row-line-height) - 2px)',
      margin: '1px 0',
      border: undefined,
      'box-shadow':
        'inset 0 0 0 1px var(--color-border), inset 0 -2px var(--color-border)',
      'border-radius': '4px',
    });
    assert.strictEqual(
      unwrapped(cascaded(combo, 'background')),
      'color-mix(in srgb, var(--color-border) 40%, var(--color-panel-background))',
    );
    const key = keyOf(combo);
    assert.ok(key);
    looks(key, {
      border: undefined,
      padding: '0 5px',
      margin: '-1px 0',
      'line-height': 'var(--row-line-height)',
    });
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
      height: '11px',
      'vertical-align': 'calc((1cap - 11px) / 2)',
    });
  });

  test('writes the keys of a shortcut in the monospace font at its size, as a path or a hash is written, so keys of as many characters are as wide in every shortcut, in the weight of the words beside them', () => {
    const popup = popupOf(<ShortcutsPopupShown />);
    const key = keyOf(withClass(popup, 'shortcut-combo'));
    assert.ok(key);
    looks(key, {
      'font-family': 'var(--monospace-font-family)',
      'font-size': 'var(--monospace-font-size)',
      'font-weight': undefined,
      'line-height': 'var(--row-line-height)',
    });
  });

  test('marks what the filter found in a shortcut, words and keys alike, in the colors of a search match', () => {
    const commander = shownEntries(
      shortcutEntries,
      plainFilter('rename f6'),
    ).find((entry) => entry.id === 'commander');
    assert.ok(commander);
    const list = rendered(
      <div className="shortcuts-popup">
        <ShortcutsList entry={commander} />
      </div>,
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
    const copy = withClass(popupOf(<AboutPopupShown />), 'about-copy');
    const filled = {
      color: 'var(--color-focus-foreground)',
      background: 'var(--color-focus)',
    };
    looks(copy, filled);
    looks(copy, filled, hovered);
    looks(copy, filled, { active: true });
    const copied = withClass(
      rendered(<CopyButton copied onClick={noop} />),
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

  test('lines the actions of every shortcut up after a column of keys of one width, wrapping a long list of keys', () => {
    const rows = allWithClass(popupOf(<ShortcutsPopupShown />), 'shortcut-row');
    const share = cascaded(rows[0], 'grid-template-columns');
    assert.match(share ?? '', /^minmax\(\d+px, [\d.]+%\) minmax\(0, 1fr\)$/);
    for (const row of rows) {
      looks(row, { 'grid-template-columns': share });
    }
    for (const keys of allWithClass(
      popupOf(<ShortcutsPopupShown />),
      'shortcut-keys',
    )) {
      looks(keys, { 'flex-wrap': 'wrap' });
    }
  });

  test('draws the shortcuts over the notices and menus, and the overlay scrollbars of its lists over it', () => {
    const backdrop = popupOf(<ShortcutsPopupShown />).parent;
    assert.ok(backdrop);
    const shortcuts = layer(backdrop);
    for (const below of [
      rendered(<ContextMenuShown />),
      rendered(<HistoryMenuShown />),
      rendered(<NoticesShown />),
    ]) {
      assert.ok(shortcuts > layer(below), below.classes.join(' '));
    }
    assert.ok(layerOver([String(shortcuts)]) > shortcuts);
  });
});

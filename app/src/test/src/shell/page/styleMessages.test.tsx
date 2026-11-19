import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { columnsClass } from '../../../../tools/git/page/columnsShown';
import { cascaded } from '../../../helpers/cascade';
import {
  Columns,
  ContextMenuShown,
  NoticesShown,
  ShortcutsPopupShown,
} from '../../../helpers/styleFixtures';
import {
  looks,
  layer,
  hovered,
  after,
  bodyVariable,
} from './stylesheetFixtures';
import { createElement } from 'react';
import { scrollbarCoverClass } from '../../../../lib/page/scrollbars';
import { keyOf, popupOf } from '../../../helpers/styleMarkup';
import {
  rendered,
  withClass,
  type MarkupElement,
} from '../../../helpers/markup';
import {
  CommitRowShown,
  HistoryMenuShown,
  MessagePanelShown,
} from '../../../helpers/styleHistoryFixtures';

function shownScrollbar(message?: string): MarkupElement {
  return withClass(
    rendered(
      createElement(
        'body',
        null,
        message !== undefined && createElement('div', { className: message }),
        createElement('div', {
          className: `${scrollbarCoverClass} vertical shown`,
        }),
      ),
    ),
    scrollbarCoverClass,
  );
}

suite('Style', () => {
  test("takes no press on a scrollbar under a commit's whole message peeked at, which is drawn over the list and its scrollbar, but does while one is pinned, which scrolls by its own", () => {
    looks(shownScrollbar('message-peek'), { display: 'none' });
    looks(shownScrollbar('message-peek pinned'), { display: 'block' });
    looks(shownScrollbar(), { display: 'block' });
  });

  test('puts the pin and the keys pinning a message peeked at, or the button closing a pinned one, beside the subject at the top right, on its first line and muted like the author, the keys drawn like the shortcuts screen draws them', () => {
    const rowLine = cascaded(
      withClass(rendered(<CommitRowShown />), 'commit-line'),
      'height',
    );
    const corner = withClass(rendered(<MessagePanelShown />), 'message-corner');
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
    const shortcutCap = withClass(
      popupOf(<ShortcutsPopupShown />),
      'shortcut-combo',
    );
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
    const close = withClass(
      rendered(<MessagePanelShown pinned />),
      'message-close',
    );
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
    const peeked = rendered(<MessagePanelShown />);
    const pinned = rendered(<MessagePanelShown pinned />);
    looks(withClass(peeked, 'message-hint'), { visibility: undefined });
    looks(withClass(peeked, 'message-close'), { visibility: 'hidden' });
    looks(withClass(pinned, 'message-hint'), { visibility: 'hidden' });
    looks(withClass(pinned, 'message-close'), { visibility: undefined });
  });

  test('cuts the rest of a message peeked at through the middle of its third line, the half line showing there is more, and shows all of it once pinned', () => {
    const rowLine = cascaded(
      withClass(rendered(<CommitRowShown />), 'commit-line'),
      'height',
    );
    looks(withClass(rendered(<MessagePanelShown />), 'message-body'), {
      'max-height': `calc(2.5 * ${rowLine})`,
      overflow: 'hidden',
    });
    looks(withClass(rendered(<MessagePanelShown pinned />), 'message-body'), {
      'max-height': undefined,
      overflow: undefined,
    });
  });

  test('tells how many lines are cut off a message peeked at in small muted type, like the hint at its corner', () => {
    const rowLine = cascaded(
      withClass(rendered(<CommitRowShown />), 'commit-line'),
      'height',
    );
    const corner = withClass(rendered(<MessagePanelShown />), 'message-corner');
    looks(rendered(<div className="message-more" />), {
      'line-height': rowLine,
      color: cascaded(corner, 'color'),
      'font-size': cascaded(corner, 'font-size'),
    });
  });

  test('lets a pinned message take the pointer, its text be selected, and a long one scroll its rest alone, keeping its subject, author, bubbles and close button in place, without scrolling on past its end, its ring and shadow letting the pointer through to the row', () => {
    looks(rendered(<MessagePanelShown pinned />), {
      'pointer-events': 'auto',
      'user-select': 'text',
    });
    for (const pseudoElement of ['::before', '::after']) {
      looks(
        rendered(<MessagePanelShown pinned />),
        { 'pointer-events': 'none' },
        { pseudoElement },
      );
    }
    const pinned = rendered(
      <MessagePanelShown
        refs={[{ kind: 'branch', name: 'main', commit: 'a' }]}
        pinned
      />,
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
    looks(rendered(<MessagePanelShown />), {
      'pointer-events': 'none',
      'user-select': undefined,
    });
    looks(withClass(rendered(<MessagePanelShown />), 'commit'), {
      display: undefined,
    });
    looks(withClass(rendered(<MessagePanelShown />), 'message-body'), {
      'overflow-y': undefined,
    });
  });

  test("draws a commit's whole message over the edges of the columns, but under the notices and menus", () => {
    const edge = layer(
      withClass(
        rendered(
          <Columns className={columnsClass(true, 'a')} active="commits" />,
        ),
        'column',
      ),
      after,
    );
    const message = layer(rendered(<MessagePanelShown />));
    assert.ok(message > edge);
    for (const above of [
      rendered(<ContextMenuShown />),
      rendered(<HistoryMenuShown />),
      rendered(<NoticesShown />),
    ]) {
      assert.ok(layer(above) > message, above.classes.join(' '));
    }
  });

  test("pops a commit's row out over itself like the other popups, ringed with their edge over the row's tint, letting the pointer through to the rows under it", () => {
    const panel = rendered(<MessagePanelShown />);
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
    const panel = rendered(<MessagePanelShown />);
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
    const panel = rendered(<MessagePanelShown />);
    const row = withClass(panel, 'commit');
    looks(row, { 'border-bottom': undefined, background: 'none' });
    looks(row, { background: 'none' }, hovered);
    looks(withClass(rendered(<MessagePanelShown selected="a" />), 'commit'), {
      background: 'none',
    });
    const rowLine = cascaded(
      withClass(rendered(<CommitRowShown />), 'commit-line'),
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

  test("pads the bottom of a pinned commit's message, so its last line keeps clear of the popup's edge as its first line does", () => {
    looks(
      withClass(
        rendered(
          <div className="message-peek pinned">
            <div className="commit" />
          </div>,
        ),
        'commit',
      ),
      { 'padding-bottom': '4px' },
    );
  });
});

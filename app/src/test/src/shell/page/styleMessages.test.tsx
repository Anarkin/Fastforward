import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { columnsClass } from '../../../../tools/git/page/columns';
import { cascaded, rendered, withClass } from '../../../helpers/cascade';
import {
  Columns,
  CommitRowShown,
  ContextMenuShown,
  HistoryMenuShown,
  MessagePanelShown,
  NoticesShown,
  ShortcutsPopupShown,
} from '../../../helpers/styleFixtures';
import {
  looks,
  layer,
  hovered,
  after,
  keyOf,
  shownScrollbar,
  popupOf,
} from './stylesheetFixtures';

suite('Style', () => {
  test("hides the overlay scrollbars while a commit's whole message is peeked at, as they are drawn over everything and would cut through it, but not while one is pinned, which scrolls with them", () => {
    looks(shownScrollbar('message-peek'), { opacity: '0' });
    looks(shownScrollbar('message-peek pinned'), { opacity: '1' });
    looks(shownScrollbar(), { opacity: '1' });
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
});

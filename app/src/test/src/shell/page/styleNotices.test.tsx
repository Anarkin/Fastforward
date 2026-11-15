import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { cascaded, matchingRules } from '../../../helpers/cascade';
import {
  CommitColumn,
  ContextMenuShown,
  NoticesShown,
} from '../../../helpers/styleFixtures';
import { columnTitle } from '../../../helpers/styleMarkup';
import { looks, bodyVariable, paddingOf } from './stylesheetFixtures';
import { allWithClass, rendered, withClass } from '../../../helpers/markup';

suite('Style', () => {
  test('keeps the notices within the window, scrolling a long message within its notice, so a checkout listing hundreds of files leaves its close button in reach', () => {
    const shown = rendered(<NoticesShown />);
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
    const menu = rendered(<ContextMenuShown />);
    for (const level of ['info', 'error']) {
      const shown = rendered(<NoticesShown level={level} />);
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
    const shown = rendered(<NoticesShown />);
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
    looks(withClass(rendered(<NoticesShown />), 'notices'), {
      position: 'fixed',
      top: 'anchor(--notices bottom, 0px)',
      left: '0',
      right: '0',
      'flex-direction': 'column',
      'justify-content': 'safe flex-end',
      'align-items': 'flex-end',
    });
    looks(withClass(rendered(<NoticesShown />), 'notice'), {
      'box-sizing': 'border-box',
    });
    assert.ok(
      cascaded(withClass(rendered(<NoticesShown />), 'notice'), 'max-width'),
    );
    for (const anchor of [
      columnTitle(<CommitColumn autoFetchMinutes={0} />),
      rendered(<div className="empty-state" />),
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
    const container = withClass(rendered(<NoticesShown />), 'notices');
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
      matchingRules(withClass(rendered(<NoticesShown />), 'notice')).map(
        (rule) => rule.selector,
      ),
      ['.notice'],
    );
    for (const level of ['info', 'error']) {
      looks(
        withClass(rendered(<NoticesShown level={level} />), 'notice-message'),
        { color: undefined },
      );
    }
    looks(withClass(rendered(<NoticesShown />), 'error-icon'), {
      flex: 'none',
      color: 'var(--color-error-foreground)',
    });
    assert.deepStrictEqual(
      allWithClass(rendered(<NoticesShown level="info" />), 'error-icon'),
      [],
    );
  });
});

import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { cascaded, matchingRules } from '../../../helpers/cascade';
import { ContextMenuShown, NoticesShown } from '../../../helpers/styleFixtures';
import { columnTitle } from '../../../helpers/styleMarkup';
import { looks, bodyVariable, paddingOf } from './stylesheetFixtures';
import { defaultSettings } from '../../../helpers/fixtures';
import { allWithClass, rendered, withClass } from '../../../helpers/markup';
import { CommitColumn } from '../../../helpers/styleHistoryFixtures';

suite('Style', () => {
  test('keeps the notices within the window, scrolling a long message within its notice, so a checkout listing hundreds of files leaves its close button in reach', () => {
    const shown = rendered(<NoticesShown />);
    looks(withClass(shown, 'notices'), {
      'box-sizing': 'border-box',
      bottom: '0',
      'overflow-y': 'auto',
    });
    const message = withClass(shown, 'card-message');
    looks(message, { 'overflow-y': 'auto' });
    assert.ok(cascaded(message, 'max-height'));
  });

  test('draws a notice as a tooltip is drawn, with the corners of a context menu, on a ground of its own in the theme, the gray of the row of a path unless set, edged in the muted color of the text, its lines a line of monospace tall, its message 8 pixels in from its left, with no room above or below it', () => {
    const menu = rendered(<ContextMenuShown />);
    for (const level of ['info', 'error']) {
      const shown = rendered(<NoticesShown level={level} />);
      looks(
        withClass(shown, 'notice'),
        Object.fromEntries(
          ['border-radius'].map((property) => [
            property,
            cascaded(menu, property),
          ]),
        ),
      );
      looks(withClass(shown, 'notice'), {
        background: 'var(--color-notice-background)',
        border: undefined,
        'box-shadow':
          'inset 0 0 0 var(--card-edge) var(--muted-foreground), var(--popup-drop)',
        'line-height': 'var(--card-line)',
        padding:
          'var(--card-edge) var(--card-edge) var(--card-edge) calc(var(--card-edge) + 8px)',
      });
      looks(withClass(shown, 'card-message'), { padding: '0' });
    }
    const { light, dark } = defaultSettings().colors;
    assert.deepStrictEqual(
      [light['notice-background'], dark['notice-background']],
      [light.border, dark.border],
    );
  });

  test("makes a notice's close button and its icon of an error a line square, as tall as the lines of its message, so they stand on its first line", () => {
    const shown = rendered(<NoticesShown />);
    looks(withClass(shown, 'card-close'), {
      width: 'var(--card-line)',
      height: 'var(--card-line)',
      margin: '0',
    });
    looks(withClass(shown, 'error-icon'), {
      height: 'var(--card-line)',
      margin: '0',
    });
  });

  test('puts the notices in the bottom right corner, below the column titles, or of the whole window when it has no tab, so they hide nothing being worked on in the middle', () => {
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
    looks(columnTitle(<CommitColumn autoFetchMinutes={0} />), {
      'anchor-name': '--notices',
    });
  });

  test('pads the notices for the shadow of a popup, which their scrolling would clip, keeping them 16px from the bottom of the window', () => {
    const shadows = [
      ...(bodyVariable('popup-drop') ?? '').matchAll(
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
      ['.card', '.card.notice'],
    );
    for (const level of ['info', 'error']) {
      looks(
        withClass(rendered(<NoticesShown level={level} />), 'card-message'),
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

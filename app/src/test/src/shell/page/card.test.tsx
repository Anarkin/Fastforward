import * as assert from 'node:assert';
import { renderToStaticMarkup } from 'react-dom/server';
import { suite, test } from 'vitest';
import { Card } from '../../../../shell/page/card';
import { defaultSettings, noop } from '../../../helpers/fixtures';
import { namedFile, sentence } from '../../../../lib/shared/sentences';
import { cascaded } from '../../../helpers/cascade';
import {
  ContextMenuShown,
  NoticesShown,
  ShortcutsPopupShown,
} from '../../../helpers/styleFixtures';
import { popupOf } from '../../../helpers/styleMarkup';
import { rendered, withClass } from '../../../helpers/markup';
import { layer, looks } from './stylesheetFixtures';

const tip = (
  <Card
    kind="tip"
    role="tooltip"
    said={sentence`Moved from ${namedFile('a/old.ts')}`}
  />
);

suite('The card a tooltip and a notice are drawn as', () => {
  test('draws a tooltip as a notice is drawn, by the one card: its words, a path among them as every path, and every shortcut of what it explains after them, each a key cap as the list of shortcuts draws it, a button of the mouse too, with no button and no icon', () => {
    const html = renderToStaticMarkup(tip);
    assert.match(
      html,
      /^<div role="tooltip" class="card tip info"><span class="card-message">Moved from <code class="name named-path">.*old\.ts.*<\/code><\/span><\/div>$/,
    );
    assert.match(
      renderToStaticMarkup(
        <Card kind="tip" said="Back" keys="BackButton Alt+ArrowLeft" />,
      ),
      /^<div class="card tip info"><span class="card-message">Back<\/span><span class="shortcut-keys"><span class="shortcut-combo"><kbd class="pointer">.*Back<\/kbd><\/span><span class="shortcut-combo"><kbd>Alt<\/kbd>.*<kbd>←<\/kbd><\/span><\/span><\/div>$/,
    );
  });

  test('gives a notice its close button, named for a screen reader, and an error its icon before its words', () => {
    const html = renderToStaticMarkup(
      <Card kind="notice" said="failed" error onClose={noop} />,
    );
    assert.match(
      html,
      /^<div class="card notice error"><svg class="icon error-icon".*<\/svg><span class="card-message">failed<\/span><button class="card-close" aria-label="Dismiss" data-tip="Dismiss" data-tip-keys="Escape">/,
    );
  });

  test('lays a tooltip over everything, the menus, the popups and the notices, where the pointer is, takes no pointer itself, so it can stand close to what it explains and never be in the way, and stays unseen until it is placed', () => {
    const card = withClass(rendered(tip), 'card');
    looks(card, {
      position: 'fixed',
      'pointer-events': 'none',
      visibility: 'hidden',
      left: '0',
      top: '0',
    });
    const backdrop = popupOf(<ShortcutsPopupShown />).parent;
    assert.ok(backdrop);
    for (const below of [
      backdrop,
      rendered(<ContextMenuShown />),
      rendered(<NoticesShown />),
    ]) {
      assert.ok(layer(card) > layer(below), below.classes.join(' '));
    }
  });

  test('gives a tooltip the corners and the shadow of a notice, and words that wrap within its width, as far in from its edges as the words of a menu are from the edges of the menu, on a ground of its own in the theme, that of a menu unless set, as the yellow of a notice was liked in neither theme', () => {
    const card = withClass(rendered(tip), 'card');
    const notice = withClass(rendered(<NoticesShown />), 'notice');
    for (const property of [
      'color',
      'border-radius',
      'box-shadow',
      'max-width',
      'box-sizing',
    ]) {
      assert.strictEqual(
        cascaded(card, property),
        cascaded(notice, property),
        property,
      );
      assert.ok(cascaded(card, property) !== undefined, property);
    }
    looks(card, {
      padding: '8px 14px',
      'align-items': 'center',
      background: 'var(--color-tooltip-background)',
    });
    const { light, dark } = defaultSettings().colors;
    assert.deepStrictEqual(
      [light['tooltip-background'], dark['tooltip-background']],
      [light['panel-background'], dark['panel-background']],
    );
    looks(withClass(card, 'card-message'), {
      'overflow-wrap': 'anywhere',
      'white-space': 'pre-wrap',
    });
  });
});

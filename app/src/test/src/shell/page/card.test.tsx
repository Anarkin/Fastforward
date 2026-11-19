import * as assert from 'node:assert';
import { renderToStaticMarkup } from 'react-dom/server';
import { suite, test } from 'vitest';
import { Card } from '../../../../shell/page/card';
import { noop } from '../../../helpers/fixtures';
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
  test('draws a tooltip as a notice is drawn, by the one card: its words, a path among them as every path, and the keys of what it explains as a key cap after them, with no button and no icon', () => {
    const html = renderToStaticMarkup(tip);
    assert.match(
      html,
      /^<div role="tooltip" class="card tip info"><span class="card-message">Moved from <code class="name named-path">.*old\.ts.*<\/code><\/span><\/div>$/,
    );
    assert.match(
      renderToStaticMarkup(<Card kind="tip" said="Find" keys="Ctrl+F" />),
      /^<div class="card tip info"><span class="card-message">Find<\/span><span class="shortcut-combo">.*<kbd>F<\/kbd><\/span><\/div>$/,
    );
  });

  test('gives a notice its close button, named for a screen reader, and an error its icon before its words', () => {
    const html = renderToStaticMarkup(
      <Card kind="notice" said="failed" error onClose={noop} />,
    );
    assert.match(
      html,
      /^<div class="card notice error"><svg class="icon error-icon".*<\/svg><span class="card-message">failed<\/span><button class="card-close" aria-label="Dismiss" data-tip="Dismiss">/,
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

  test('gives a tooltip the ground, the corners and the shadow of a notice, and words that wrap within its width, tighter around them than a notice', () => {
    const card = withClass(rendered(tip), 'card');
    const notice = withClass(rendered(<NoticesShown />), 'notice');
    for (const property of [
      'color',
      'background',
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
    looks(card, { padding: '3px 8px', 'align-items': 'center' });
    looks(withClass(card, 'card-message'), {
      'overflow-wrap': 'anywhere',
      'white-space': 'pre-wrap',
    });
  });
});

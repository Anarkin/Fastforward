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
  test('draws a tooltip as a notice is drawn, by the one card: its words, a path among them as every path, with no keys, no button and no icon, as a tooltip names what a control does and the list of shortcuts its keys', () => {
    const html = renderToStaticMarkup(tip);
    assert.match(
      html,
      /^<div role="tooltip" class="card tip info"><span class="card-message">Moved from <code class="name named-path">.*old\.ts.*<\/code><\/span><\/div>$/,
    );
    assert.doesNotMatch(html, /shortcut|<kbd/);
  });

  test('draws the rows a tooltip tells under its words, a row its name and its values in monospace', () => {
    const html = renderToStaticMarkup(
      <Card
        kind="tip"
        said="Preview"
        rows={[
          { name: 'Markdown', values: '.md .markdown' },
          { name: 'PDF', values: '.pdf' },
        ]}
      />,
    );

    assert.match(
      html,
      /^<div class="card tip info detailed"><span class="card-message">Preview<\/span><span class="card-details"><span class="card-row-name">Markdown<\/span><code class="card-row-values">\.md \.markdown<\/code><span class="card-row-name">PDF<\/span><code class="card-row-values">\.pdf<\/code><\/span><\/div>$/,
    );
    const card = rendered(
      <Card
        kind="tip"
        said="Preview"
        rows={[{ name: 'PDF', values: '.pdf' }]}
      />,
    );
    looks(withClass(card, 'card'), { 'flex-wrap': 'wrap' });
    looks(withClass(card, 'card-message'), { flex: 'none' });
    looks(withClass(card, 'card-details'), {
      'flex-basis': '100%',
      display: 'grid',
    });
    looks(withClass(card, 'card-row-values'), {
      'font-family': 'var(--monospace-font-family)',
      'font-size': 'var(--monospace-font-size)',
    });
  });

  test('gives a notice its close button, named for a screen reader, and an error its icon before its words', () => {
    const html = renderToStaticMarkup(
      <Card kind="notice" said="failed" error onClose={noop} />,
    );
    assert.match(
      html,
      /^<div class="card notice error"><svg class="icon error-icon".*<\/svg><span class="card-message">failed<\/span><button class="card-close" aria-label="Dismiss">/,
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

  test('gives a tooltip the corners, the shadow and the edge of a notice, its lines a line of monospace tall as the rows of the app are, its words 8 pixels in from its sides, edged by an inset shadow of 2 pixels rounded down to whole device pixels rather than a border, which Chromium rounds and shifts the words by, on a ground of its own in the theme, the gray of the row of a path unless set, which its edge, in the muted color of the text, sets apart from that row', () => {
    const card = withClass(rendered(tip), 'card');
    const notice = withClass(rendered(<NoticesShown />), 'notice');
    for (const property of [
      'color',
      'border-radius',
      'box-shadow',
      'max-width',
      'box-sizing',
      'line-height',
    ]) {
      assert.strictEqual(
        cascaded(card, property),
        cascaded(notice, property),
        property,
      );
      assert.ok(cascaded(card, property) !== undefined, property);
    }
    looks(card, {
      padding: 'var(--card-edge) calc(var(--card-edge) + 8px)',
      'align-items': 'center',
      'line-height': 'var(--card-line)',
      '--card-edge': 'round(down, 2px, var(--device-pixel, 1px))',
      border: undefined,
      'box-shadow':
        'inset 0 0 0 var(--card-edge) var(--muted-foreground), var(--popup-drop)',
      background: 'var(--color-tooltip-background)',
    });
    const { light, dark } = defaultSettings().colors;
    assert.deepStrictEqual(
      [light['tooltip-background'], dark['tooltip-background']],
      [light.border, dark.border],
    );
    looks(withClass(card, 'card-message'), {
      'overflow-wrap': 'anywhere',
      'white-space': 'pre-wrap',
    });
  });
});

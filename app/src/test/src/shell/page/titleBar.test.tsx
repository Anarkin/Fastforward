import * as assert from 'node:assert';
import { renderToStaticMarkup } from 'react-dom/server';
import { suite, test } from 'vitest';
import { TitleBar } from '../../../../shell/page/titleBar';
import { stylesheet } from '../../../helpers/fixtures';

suite('Title bar', () => {
  test('shows the icon and the title', () => {
    const html = renderToStaticMarkup(
      <TitleBar title="/code/app - Fastforward" />,
    );
    assert.match(html, /<svg class="title-bar-icon"/);
    assert.match(html, />\/code\/app - Fastforward<\/span>/);
  });

  test("puts the app's menu between the icon and the title, kept out of the area that drags the window, opening to the right", () => {
    const html = renderToStaticMarkup(
      <TitleBar title="Fastforward" menu={<button className="app-menu" />} />,
    );
    assert.match(
      html,
      /<svg class="title-bar-icon"[^]*<\/svg><button class="app-menu"><\/button><span class="title-bar-text">Fastforward<\/span>/,
    );
    const css = stylesheet();
    assert.match(
      css,
      /\.title-bar \.menu-button \{[^}]*-webkit-app-region: no-drag;/,
    );
    assert.match(css, /\.title-bar \.menu \{[^}]*left: 0;[^}]*right: auto;/);
  });

  test("writes the title at full strength, as it names the window, and draws the app's menu beside it alike", () => {
    assert.match(
      stylesheet(),
      /\.title-bar-content \{[^}]*color: var\(--color-foreground\);/,
    );
  });

  test('drags the window, and keeps clear of the window buttons', () => {
    const css = stylesheet();
    assert.match(css, /\.title-bar \{[^}]*-webkit-app-region: drag;/);
    assert.match(
      css,
      /\.title-bar-content \{[^}]*width: env\(titlebar-area-width, 100%\);[^}]*margin-left: env\(titlebar-area-x, 0\);/,
    );
    assert.match(
      css,
      /:root\[data-platform='darwin'\] \.title-bar-content \{[^}]*padding-left: 78px;/,
    );
  });

  test('drags the window by the tab row, clear of the window buttons, but not by its tabs and buttons', () => {
    const css = stylesheet();
    assert.match(css, /\n\.tabs \{[^}]*-webkit-app-region: drag;/);
    assert.match(
      css,
      /\n\.tabs \{[^}]*100vw - env\(titlebar-area-x, 0px\) - env\(titlebar-area-width, 100vw\)[^}]*calc\(\s*env\(titlebar-area-x, 0px\) \+ var\(--app-icon-margin\) -\s*var\(--app-icon-padding\)\s*\);/,
    );
    assert.match(
      css,
      /:root\[data-platform='darwin'\] \.tabs \{[^}]*padding-left: 78px;/,
    );
    assert.match(
      css,
      /\.tabs \.tab,\n\.tabs \.tab-add,\n\.tabs \.menu-button \{[^}]*-webkit-app-region: no-drag;/,
    );
  });
});

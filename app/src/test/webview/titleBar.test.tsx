import * as assert from 'node:assert';
import { renderToStaticMarkup } from 'react-dom/server';
import { suite, test } from 'vitest';
import { strings } from '../../shared/strings';
import { TitleBar, windowTitle } from '../../webview/titleBar';
import { stylesheet, stylesheetPx } from '../fixtures';

suite('Title bar', () => {
  test('names the open repository, or only the app without one', () => {
    assert.strictEqual(
      windowTitle('/code/app', 'Fastforward 1.2.3'),
      '/code/app - Fastforward 1.2.3',
    );
    assert.strictEqual(
      windowTitle(undefined, 'Fastforward 1.2.3'),
      'Fastforward 1.2.3',
    );
  });

  test('names the open repository in the format the dictionary gives, so a translation reaches the title', () => {
    const { app } = strings;
    const format = app.windowTitle;
    app.windowTitle = (root, name) => `${name} | ${root}`;
    try {
      assert.strictEqual(
        windowTitle('/code/app', 'Fastforward'),
        'Fastforward | /code/app',
      );
    } finally {
      app.windowTitle = format;
    }
  });

  test('names the app with its version, marking a run from the source', () => {
    assert.strictEqual(strings.app.name('1.2.3', false), 'Fastforward 1.2.3');
    assert.strictEqual(
      strings.app.name('1.2.3', true),
      'Fastforward 1.2.3 Dev',
    );
  });

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

  test('starts the icon where the tab names start', () => {
    assert.match(
      stylesheet(),
      /\n\.tabs \{[^}]*padding: \S+ \S+ \S+ var\(--tab-inset\);/,
    );
    assert.strictEqual(
      stylesheetPx(/--title-bar-inset: calc\(var\(--tab-inset\) \+ (\d+)px\);/),
      stylesheetPx(/\n\.tab \{[^}]*padding: \S+ \S+ \S+ (\d+)px;/),
    );
  });
});

import * as assert from 'node:assert';
import { renderToStaticMarkup } from 'react-dom/server';
import { strings } from '../shared/strings';
import { TitleBar, windowTitle } from '../webview/titleBar';
import { stylesheet, stylesheetPx } from './fixtures';

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
    assert.strictEqual(
      stylesheetPx(/--title-bar-inset: (\d+)px;/),
      stylesheetPx(/\n\.tabs \{[^}]*padding: \S+ \S+ \S+ (\d+)px;/) +
        stylesheetPx(/\n\.tab \{[^}]*padding: \S+ \S+ \S+ (\d+)px;/),
    );
  });
});

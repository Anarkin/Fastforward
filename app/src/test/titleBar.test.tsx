import * as assert from 'node:assert';
import { renderToStaticMarkup } from 'react-dom/server';
import { TitleBar, windowTitle } from '../webview/titleBar';
import { stylesheet } from './fixtures';

suite('Title bar', () => {
  test('names the open repository, or only the app without one', () => {
    assert.strictEqual(windowTitle('/code/app'), '/code/app - Fastforward');
    assert.strictEqual(windowTitle(undefined), 'Fastforward');
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
    const css = stylesheet();
    const px = (pattern: RegExp) => {
      const match = pattern.exec(css);
      assert.ok(match, String(pattern));
      return Number(match[1]);
    };
    assert.strictEqual(
      px(/--title-bar-inset: (\d+)px;/),
      px(/\n\.tabs \{[^}]*padding: \S+ \S+ \S+ (\d+)px;/) +
        px(/\n\.tab \{[^}]*padding: \S+ \S+ \S+ (\d+)px;/),
    );
  });
});

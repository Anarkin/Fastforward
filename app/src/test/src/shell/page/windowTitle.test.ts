import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { strings } from '../../../../lib/shared/strings';
import { windowTitle } from '../../../../shell/page/windowTitle';

suite('Window title', () => {
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
});

import * as assert from 'node:assert';
import { isValidElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { suite, test } from 'vitest';
import { aboutText } from '../../../../shell/page/aboutText';
import { AboutPopup, CopyButton } from '../../../../shell/page/aboutPopup';
import type { AboutInfo, ToHost } from '../../../../shell/shared/protocol';
import { createShellStore } from '../../../../shell/page/store';
import { withStores } from '../../../helpers/componentFixtures';
import { noop, renderedBy, tagWith } from '../../../helpers/fixtures';

const about = {
  version: '16.0.0',
  development: true,
  git: '2.56.0',
  system: 'Windows 11, build 26300, x64',
};

function aboutStore(shown: AboutInfo, post: (message: ToHost) => void = noop) {
  return createShellStore(post, { about: shown, popups: ['about'] });
}

function aboutMarkup(shown: AboutInfo): string {
  return renderToStaticMarkup(
    withStores(<AboutPopup />, { shell: aboutStore(shown) }),
  );
}

function buttonsIn(node: unknown): { onClick: () => void }[] {
  if (Array.isArray(node)) {
    return node.flatMap(buttonsIn);
  }
  if (!isValidElement<{ children?: unknown; onClick?: () => void }>(node)) {
    return [];
  }
  const own = node.props.onClick ? [{ onClick: node.props.onClick }] : [];
  return [...own, ...buttonsIn(node.props.children)];
}

suite('About popup', () => {
  test('names the app, its version, the git it runs and where it lives, the address opening in the browser', () => {
    const html = aboutMarkup(about);
    assert.match(html, /role="dialog"/);
    assert.match(html, />Fastforward</);
    assert.match(html, />Version 16\.0\.0 Dev</);
    assert.match(html, />git 2\.56\.0</);
    assert.match(html, />Windows 11, build 26300, x64</);
    const link = tagWith(html, 'href="https://github.com/Anarkin/Fastforward"');
    assert.match(link, /target="_blank"/);
    const order = ['Version 16.0.0 Dev', 'Anarkin/Fastforward<', 'git 2.56.0'];
    assert.deepStrictEqual(
      order.map((text) => html.indexOf(text)).toSorted((a, b) => a - b),
      order.map((text) => html.indexOf(text)),
    );
    assert.ok(
      html.indexOf('git 2.56.0') < html.indexOf('Windows 11, build 26300, x64'),
    );
    assert.match(
      aboutMarkup({ ...about, development: false }),
      />Version 16\.0\.0</,
    );
  });

  test('says Copied on its copy button for a moment after copying, so the click shows it took', () => {
    const copied = renderToStaticMarkup(<CopyButton copied onClick={noop} />);
    assert.match(tagWith(copied, '', 'about-copy', 'copied'), /title="/);
    assert.match(copied, />Copied<\/button>$/);
    assert.match(
      renderToStaticMarkup(<CopyButton copied={false} onClick={noop} />),
      /class="about-copy ?"[^>]*>Copy<\/button>$/,
    );
  });

  test('copies its lines for a bug report in the order it shows them, and closes on its button', () => {
    assert.strictEqual(
      aboutText(about),
      [
        'Fastforward',
        'Version 16.0.0 Dev',
        'https://github.com/Anarkin/Fastforward',
        'git 2.56.0',
        'Windows 11, build 26300, x64',
      ].join('\n'),
    );
    const done: string[] = [];
    const store = aboutStore(about, (message) => {
      if (message.type === 'copyText') {
        done.push(message.text);
      }
    });
    const popup = renderedBy(AboutPopup, {}, { shell: store });
    for (const button of buttonsIn(popup)) {
      button.onClick();
    }
    if (!store.getState().popups.includes('about')) {
      done.push('closed');
    }
    assert.deepStrictEqual(
      done.toSorted(),
      [aboutText(about), 'closed'].toSorted(),
    );
  });
});

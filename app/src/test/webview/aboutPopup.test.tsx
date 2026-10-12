import * as assert from 'node:assert';
import { isValidElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { suite, test } from 'vitest';
import { AboutPopup, aboutText, CopyButton } from '../../webview/aboutPopup';
import { noop, renderedBy, tagWith } from '../fixtures';

const about = {
  version: '16.0.0',
  development: true,
  git: '2.56.0',
  system: 'Windows 11, build 26300, x64',
};

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
    const html = renderToStaticMarkup(
      <AboutPopup about={about} onCopy={noop} onClose={noop} />,
    );
    assert.match(html, /role="dialog"/);
    assert.match(html, />Fastforward</);
    assert.match(html, />Version 16\.0\.0 Dev</);
    assert.match(html, />git 2\.56\.0</);
    assert.match(html, />Windows 11, build 26300, x64</);
    const link = tagWith(html, 'href="https://github.com/Anarkin/Fastforward"');
    assert.match(link, /target="_blank"/);
    assert.match(
      renderToStaticMarkup(
        <AboutPopup
          about={{ ...about, development: false }}
          onCopy={noop}
          onClose={noop}
        />,
      ),
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

  test('copies its lines for a bug report, and closes on its button', () => {
    assert.strictEqual(
      aboutText(about),
      [
        'Fastforward',
        'Version 16.0.0 Dev',
        'git 2.56.0',
        'Windows 11, build 26300, x64',
        'https://github.com/Anarkin/Fastforward',
      ].join('\n'),
    );
    const done: string[] = [];
    const popup = renderedBy(AboutPopup, {
      about,
      onCopy: (text) => done.push(text),
      onClose: () => done.push('closed'),
    });
    for (const button of buttonsIn(popup)) {
      button.onClick();
    }
    assert.deepStrictEqual(
      done.toSorted(),
      [aboutText(about), 'closed'].toSorted(),
    );
  });
});

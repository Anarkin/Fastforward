import * as assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { renderToStaticMarkup } from 'react-dom/server';
import { suite, test } from 'vitest';
import { StatusLine } from '../../../../lib/page/statusLine';

const page = (html: string) => new JSDOM(html).window.document;

suite('Status line', () => {
  test('draws a footer of a column with its text', () => {
    const document = page(
      renderToStaticMarkup(
        <StatusLine font="proportional">12 files changed</StatusLine>,
      ),
    );
    assert.strictEqual(
      document.querySelector('footer.column-status > .column-status-text')
        ?.textContent,
      '12 files changed',
    );
  });

  test('tells screen readers what it says only when it is to announce it, as a line that always shows something would be read at every change', () => {
    const announced = page(
      renderToStaticMarkup(
        <StatusLine font="proportional" announced>
          Reading
        </StatusLine>,
      ),
    );
    const quiet = page(
      renderToStaticMarkup(
        <StatusLine font="proportional">Reading</StatusLine>,
      ),
    );
    assert.strictEqual(
      announced.querySelector('[role]')?.className,
      'column-status-text',
    );
    assert.strictEqual(
      announced.querySelector('.column-status-text')?.getAttribute('role'),
      'status',
    );
    assert.strictEqual(quiet.querySelector('[role]'), null);
  });

  test('sets what it says in the monospace font when it says what is written in code, and in the font of the app otherwise', () => {
    const monospace = page(
      renderToStaticMarkup(<StatusLine font="monospace">Col 12</StatusLine>),
    );
    const proportional = page(
      renderToStaticMarkup(
        <StatusLine font="proportional">Reading…</StatusLine>,
      ),
    );
    assert.strictEqual(
      monospace.querySelector('footer')?.className,
      'column-status monospace',
    );
    assert.strictEqual(
      proportional.querySelector('footer')?.className,
      'column-status',
    );
  });
});

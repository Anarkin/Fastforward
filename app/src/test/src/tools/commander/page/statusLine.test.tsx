import * as assert from 'node:assert';
import { JSDOM } from 'jsdom';
import { renderToStaticMarkup } from 'react-dom/server';
import { suite, test } from 'vitest';
import { StatusLine } from '../../../../../tools/commander/page/statusLine';

const page = (html: string) => new JSDOM(html).window.document;

suite('Status line', () => {
  test('draws a footer of a column with its text, and what is at its end apart', () => {
    const document = page(
      renderToStaticMarkup(
        <StatusLine font="proportional" end="Esc stops">
          12 files in 3 folders
        </StatusLine>,
      ),
    );
    const footer = document.querySelector('footer.column-status');
    assert.strictEqual(
      footer?.querySelector('.column-status-text')?.textContent,
      '12 files in 3 folders',
    );
    assert.strictEqual(
      footer.querySelector('.column-status-end')?.textContent,
      'Esc stops',
    );
  });

  test('draws nothing at its end when it is given nothing for it', () => {
    const document = page(
      renderToStaticMarkup(<StatusLine font="proportional">Ready</StatusLine>),
    );
    assert.strictEqual(document.querySelector('.column-status-end'), null);
  });

  test('tells screen readers what it says, not what is at its end, only when it is to announce it, as a line that always shows something would be read at every change', () => {
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
      announced.querySelector('.column-status-text')?.getAttribute('role'),
      'status',
    );
    assert.strictEqual(
      announced.querySelector('[role]')?.className,
      'column-status-text',
    );
    assert.strictEqual(quiet.querySelector('[role]'), null);
  });

  test('marks what it says as a warning or an error by its tone', () => {
    const warning = page(
      renderToStaticMarkup(
        <StatusLine font="proportional" tone="warning">
          Stopped
        </StatusLine>,
      ),
    );
    const error = page(
      renderToStaticMarkup(
        <StatusLine font="proportional" tone="error">
          Failed
        </StatusLine>,
      ),
    );
    assert.strictEqual(
      warning.querySelector('footer')?.className,
      'column-status warning',
    );
    assert.strictEqual(
      error.querySelector('footer')?.className,
      'column-status error',
    );
  });

  test('sets what it says in the monospace font when it says what is written in code, and in the font of the app otherwise', () => {
    const monospace = page(
      renderToStaticMarkup(
        <StatusLine font="monospace" tone="warning">
          Col 12
        </StatusLine>,
      ),
    );
    const proportional = page(
      renderToStaticMarkup(
        <StatusLine font="proportional">Reading…</StatusLine>,
      ),
    );
    assert.strictEqual(
      monospace.querySelector('footer')?.className,
      'column-status monospace warning',
    );
    assert.strictEqual(
      proportional.querySelector('footer')?.className,
      'column-status',
    );
  });
});

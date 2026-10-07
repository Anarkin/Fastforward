import * as assert from 'node:assert';
import { renderToStaticMarkup } from 'react-dom/server';
import { Highlight } from '../../webview/highlight';

suite('Highlight', () => {
  test('marks the search where it is, also after letters that lowercase longer', () => {
    assert.strictEqual(
      renderToStaticMarkup(<Highlight text="İstanbul main" query="main" />),
      'İstanbul <mark class="match">main</mark>',
    );
  });

  test('marks the search in a text, ignoring case and spaces around it', () => {
    assert.strictEqual(
      renderToStaticMarkup(<Highlight text="feature/Main" query=" main " />),
      'feature/<mark class="match">Main</mark>',
    );
  });
});

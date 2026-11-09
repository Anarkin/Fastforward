import * as assert from 'node:assert';
import { renderToStaticMarkup } from 'react-dom/server';
import { suite, test } from 'vitest';
import { Name, NameLines } from '../../ui/name';

suite('Name', () => {
  test('writes a name as code, each folder of a path a piece of its own up to and with its separator, so a path wraps only after a separator rather than at a hyphen or a space inside a name', () => {
    assert.strictEqual(
      renderToStaticMarkup(
        <Name>{'C:\\Code\\epm-budn\\Fastforward files'}</Name>,
      ),
      '<code class="name"><span>C:\\</span><span>Code\\</span><span>epm-budn\\</span><span>Fastforward files</span></code>',
    );
    assert.strictEqual(
      renderToStaticMarkup(<Name>{'/tmp/a.zip'}</Name>),
      '<code class="name"><span>/</span><span>tmp/</span><span>a.zip</span></code>',
    );
    assert.strictEqual(
      renderToStaticMarkup(<Name>{'report.pdf'}</Name>),
      '<code class="name"><span>report.pdf</span></code>',
    );
  });

  test('lines each value up after its label, a name as a name and a count in the words around it', () => {
    assert.strictEqual(
      renderToStaticMarkup(
        <NameLines
          lines={[
            { label: 'Copy', text: '3 items' },
            { label: 'To', name: 'D:\\photos' },
          ]}
        />,
      ),
      '<div class="name-lines"><span class="name-label">Copy</span><span class="name-value">3 items</span><span class="name-label">To</span><span class="name-value"><code class="name"><span>D:\\</span><span>photos</span></code></span></div>',
    );
  });
});

import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { documentLink } from '../../../../../tools/viewer/page/documentLinks';

const document = 'C:/Code/project/docs/guide.md';
const from = (href: string) => documentLink(document, href);

suite('Links in documents', () => {
  test('finds the file or folder a link names by its path from the document, and the heading after its #, as GitHub follows them', () => {
    assert.deepStrictEqual(from('other.md'), {
      path: 'C:/Code/project/docs/other.md',
      anchor: '',
    });
    assert.deepStrictEqual(from('./FEATURES-EDITOR.md#common-app'), {
      path: 'C:/Code/project/docs/FEATURES-EDITOR.md',
      anchor: 'common-app',
    });
    assert.deepStrictEqual(from('../README.md'), {
      path: 'C:/Code/project/README.md',
      anchor: '',
    });
    assert.deepStrictEqual(from('../app/'), {
      path: 'C:/Code/project/app',
      anchor: '',
    });
    assert.deepStrictEqual(from('my%20notes.md#caf%C3%A9'), {
      path: 'C:/Code/project/docs/my notes.md',
      anchor: 'café',
    });
  });

  test('takes a link to a heading alone for one in the document itself', () => {
    assert.deepStrictEqual(from('#common-app'), {
      path: document,
      anchor: 'common-app',
    });
  });

  test('follows no link to a server, by a scheme, from the root of a repository it does not know, or that it cannot read', () => {
    for (const elsewhere of [
      'https://example.com/a.md',
      '//example.com/a.md',
      'mailto:someone@example.com',
      'javascript:alert(1)',
      'file:///C:/a.md',
      'C:/a.md',
      '/docs/a.md',
      '%E0%A4%A.md',
    ]) {
      assert.strictEqual(from(elsewhere), undefined, elsewhere);
    }
  });

  test('climbs no higher than the share of a document on a network share, as a link climbing past it named another server, and no higher than the drive or the root', () => {
    const shared = '//server/share/docs/a.md';
    assert.deepStrictEqual(documentLink(shared, '../b.md'), {
      path: '//server/share/b.md',
      anchor: '',
    });
    for (const [start, href] of [
      [shared, '../../evil/s/x.md'],
      [shared, '../../../evil/s/x.md'],
      ['C:/docs/a.md', '../../b.md'],
      ['/docs/a.md', '../../b.md'],
    ]) {
      assert.strictEqual(documentLink(start, href), undefined, href);
    }
  });
});

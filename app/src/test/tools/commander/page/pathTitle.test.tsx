import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { PathTitle } from '../../../../tools/commander/page/pathTitle';

const titled = (
  path: string,
  hidden: readonly boolean[] = [],
  color?: string,
) =>
  renderToStaticMarkup(<PathTitle path={path} hidden={hidden} color={color} />);

const archived = (path: string) =>
  renderToStaticMarkup(
    <PathTitle path={path} hidden={[]} color="teal" coloredPart={2} />,
  );

suite('The path of a commander title', () => {
  test('shows the folders, the separator after them included, apart from the name, as the folders give way first when the path is too long, left to right within folders cut from their start', () => {
    assert.strictEqual(
      titled('C:\\Downloads\\notes.txt'),
      '<span class="column-name path-title"><span class="path-text"><span class="path-folder"><span dir="ltr"><span class="path-part">C:\\</span><span class="path-part">Downloads</span>\\</span></span><span class="path-end"><span class="path-name">notes.txt</span></span></span></span>',
    );
  });

  test('names the root of a drive whole, as it has no folders', () => {
    assert.strictEqual(
      titled('C:\\'),
      '<span class="column-name path-title"><span class="path-text"><span class="path-end"><span class="path-name">C:\\</span></span></span></span>',
    );
  });

  test('dims each hidden part, folders and name alike, as each own row is, leaving the others and the separators as they are', () => {
    assert.strictEqual(
      titled('C:\\ProgramData\\cache\\.lock', [false, true, false, true]),
      '<span class="column-name path-title"><span class="path-text"><span class="path-folder"><span dir="ltr"><span class="path-part">C:\\</span><span class="path-part hidden">ProgramData</span>\\<span class="path-part">cache</span>\\</span></span><span class="path-end"><span class="path-name hidden">.lock</span></span></span></span>',
    );
  });

  test('colors the name alone, as only a file has a color', () => {
    assert.strictEqual(
      titled('C:\\Downloads\\order.eml', [false, false, false], 'orange'),
      '<span class="column-name path-title"><span class="path-text"><span class="path-folder"><span dir="ltr"><span class="path-part">C:\\</span><span class="path-part">Downloads</span>\\</span></span><span class="path-end"><span class="path-name colored" style="--file-color:orange">order.eml</span></span></span></span>',
    );
  });

  test('colors the part asked for, as an archive the folder shown is inside is colored as its file, whether the path ends with it or goes on inside it', () => {
    assert.strictEqual(
      archived('C:\\Downloads\\a.zip\\docs'),
      '<span class="column-name path-title"><span class="path-text"><span class="path-folder"><span dir="ltr"><span class="path-part">C:\\</span><span class="path-part">Downloads</span>\\<span class="path-part colored" style="--file-color:teal">a.zip</span>\\</span></span><span class="path-end"><span class="path-name">docs</span></span></span></span>',
    );
    assert.strictEqual(
      archived('C:\\Downloads\\a.zip'),
      '<span class="column-name path-title"><span class="path-text"><span class="path-folder"><span dir="ltr"><span class="path-part">C:\\</span><span class="path-part">Downloads</span>\\</span></span><span class="path-end"><span class="path-name colored" style="--file-color:teal">a.zip</span></span></span></span>',
    );
  });
});

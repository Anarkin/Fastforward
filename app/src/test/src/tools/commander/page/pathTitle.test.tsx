import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { PathTitle } from '../../../../../tools/commander/page/pathTitle';
import {
  fileLooks,
  folderLooks,
} from '../../../../../tools/commander/page/headerLooks';
import { PathLooksContext } from '../../../../../lib/page/pathLooks';
import { fileColorsOf } from '../../../../../lib/page/fileColors';
import type { PartLooks } from '../../../../../lib/page/pathLooks';

const colors = fileColorsOf([
  { extensions: ['eml'], colors: { light: 'orange', dark: 'orange' } },
  { extensions: ['zip'], colors: { light: 'teal', dark: 'teal' } },
]);

const titled = (path: string, looks: PartLooks, file = false) =>
  renderToStaticMarkup(
    <PathLooksContext
      value={{
        subscribe: () => () => {},
        fileColors: () => colors,
        known: () => new Map(),
        ask: () => {},
        know: () => {},
        dotHides: () => false,
      }}
    >
      <PathTitle path={path} file={file} looks={looks} />
    </PathLooksContext>,
  );

suite('The path of a commander title', () => {
  test('shows the folders, the separator after them included, apart from the name, as the folders give way first when the path is too long, left to right within folders cut from their start', () => {
    assert.strictEqual(
      titled('C:\\Downloads\\notes.txt', fileLooks([false, false, false])),
      '<span class="column-name path-title"><span class="path-text"><span class="path-folder"><span dir="ltr"><span class="path-part">C:\\</span><span class="path-part">Downloads</span>\\</span></span><span class="path-end"><span class="path-name path-part">notes.txt</span></span></span></span>',
    );
  });

  test('names the root of a drive whole, as it has no folders', () => {
    assert.strictEqual(
      titled('C:\\', folderLooks([false], undefined)),
      '<span class="column-name path-title"><span class="path-text"><span class="path-end"><span class="path-name path-part">C:\\</span></span></span></span>',
    );
  });

  test('dims each hidden part, folders and name alike, as each own row is, leaving the others and the separators as they are', () => {
    assert.strictEqual(
      titled(
        'C:\\ProgramData\\cache\\.lock',
        fileLooks([false, true, false, true]),
      ),
      '<span class="column-name path-title"><span class="path-text"><span class="path-folder"><span dir="ltr"><span class="path-part">C:\\</span><span class="path-part hidden">ProgramData</span>\\<span class="path-part">cache</span>\\</span></span><span class="path-end"><span class="path-name path-part hidden">.lock</span></span></span></span>',
    );
  });

  test('colors a file as the commander lists it, and no folder', () => {
    assert.strictEqual(
      titled('C:\\Downloads\\order.eml', fileLooks([false, false, false])),
      '<span class="column-name path-title"><span class="path-text"><span class="path-folder"><span dir="ltr"><span class="path-part">C:\\</span><span class="path-part">Downloads</span>\\</span></span><span class="path-end"><span class="path-name path-part colored" style="--file-color:light-dark(orange, orange)">order.eml</span></span></span></span>',
    );
    assert.strictEqual(
      titled(
        'C:\\mail.eml\\inbox',
        folderLooks([false, false, false], undefined),
      ),
      '<span class="column-name path-title"><span class="path-text"><span class="path-folder"><span dir="ltr"><span class="path-part">C:\\</span><span class="path-part">mail.eml</span>\\</span></span><span class="path-end"><span class="path-name path-part">inbox</span></span></span></span>',
    );
  });

  test('colors the archive a folder shown is inside as its file, whether the path ends with it or goes on inside it', () => {
    assert.strictEqual(
      titled(
        'C:\\Downloads\\a.zip\\docs',
        folderLooks([false, false, false, false], 'C:\\Downloads\\a.zip'),
      ),
      '<span class="column-name path-title"><span class="path-text"><span class="path-folder"><span dir="ltr"><span class="path-part">C:\\</span><span class="path-part">Downloads</span>\\<span class="path-part colored" style="--file-color:light-dark(teal, teal)">a.zip</span>\\</span></span><span class="path-end"><span class="path-name path-part">docs</span></span></span></span>',
    );
    assert.strictEqual(
      titled(
        'C:\\Downloads\\a.zip',
        folderLooks([false, false, false], 'C:\\Downloads\\a.zip'),
      ),
      '<span class="column-name path-title"><span class="path-text"><span class="path-folder"><span dir="ltr"><span class="path-part">C:\\</span><span class="path-part">Downloads</span>\\</span></span><span class="path-end"><span class="path-name path-part colored" style="--file-color:light-dark(teal, teal)">a.zip</span></span></span></span>',
    );
  });
});

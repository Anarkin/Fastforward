import * as assert from 'node:assert';
import { renderToStaticMarkup } from 'react-dom/server';
import { suite, test } from 'vitest';
import {
  FileNote,
  FileHeader,
  DiffSkeleton,
  HunkDivider,
} from '../../../../../components/diff/page/rowParts';
import { tagsWith } from '../../../../helpers/markup';
import { PathLooksContext } from '../../../../../lib/page/pathLooks';
import { fileColorsOf } from '../../../../../lib/page/fileColors';
import { strings } from '../../../../../lib/shared/strings';

const binaryMarkup = (change: 'added' | 'removed', split: boolean) =>
  renderToStaticMarkup(
    <FileNote text="Binary file" change={change} split={split} />,
  );

suite('Binary files', () => {
  test('says a file added or deleted is binary on the side it has, hatching the other side by side, and tints it inline, a note of a side and never of both', () => {
    assert.strictEqual(
      binaryMarkup('added', false),
      '<div class="file-note side-note added">Binary file</div>',
    );
    assert.strictEqual(
      binaryMarkup('added', true),
      '<div class="split-line note-line"><div class="file-note split-side filler"></div><div class="file-note split-side added">Binary file</div></div>',
    );
    assert.strictEqual(
      binaryMarkup('removed', true),
      '<div class="split-line note-line"><div class="file-note split-side removed">Binary file</div><div class="file-note split-side filler"></div></div>',
    );
  });
});

const collapsibleHeader = (collapsible: boolean) =>
  renderToStaticMarkup(
    <FileHeader
      path="a.ts"
      open
      notes={[]}
      collapsible={collapsible}
      onClick={() => {}}
    />,
  );

suite('Diff file header', () => {
  test('says once on the header what holds for the whole file, each beside the other after its path, rather than on a line of each side', () => {
    const html = renderToStaticMarkup(
      <FileHeader
        path="q.sh"
        oldPath="p.sh"
        open
        notes={[
          strings.diff.renamedWithoutChanges,
          strings.diff.modeChanged('100644', '100755'),
        ]}
        collapsible={false}
        onClick={() => {}}
      />,
    );
    assert.deepStrictEqual(
      [...html.matchAll(/<span class="file-header-note">([^<]*)<\/span>/g)].map(
        ([, note]) => note,
      ),
      ['Renamed without changes', 'Mode changed from 100644 to 100755'],
    );
  });

  test('labels a file shown entire as unchanged, naming no commit, as it may be in the uncommitted changes or a comparison', () => {
    const html = renderToStaticMarkup(
      <FileHeader
        path="a.ts"
        open
        notes={[strings.diff.unchanged]}
        collapsible={false}
        onClick={() => {}}
      />,
    );
    assert.match(html, /<span class="file-header-note">Unchanged<\/span>/);
    assert.doesNotMatch(html, /commit/);
    assert.doesNotMatch(
      renderToStaticMarkup(
        <FileHeader
          path="a.ts"
          open
          notes={[]}
          collapsible
          onClick={() => {}}
        />,
      ),
      /unchanged/,
    );
  });

  test('draws the twisty only on a header that can collapse', () => {
    assert.match(collapsibleHeader(true), /twisty/);
    assert.doesNotMatch(collapsibleHeader(false), /twisty/);
  });

  test('names a renamed file by both its paths, shortened as git does, each folder and file a part of a path colored as the commander lists it, with both in full in its tooltip', () => {
    const html = renderToStaticMarkup(
      <PathLooksContext
        value={{
          subscribe: () => () => {},
          fileColors: () =>
            fileColorsOf([
              { extensions: ['txt'], colors: { light: 'blue', dark: 'blue' } },
            ]),
          known: () => new Map(),
          ask: () => {},
          know: () => {},
          dotHides: () => false,
        }}
      >
        <FileHeader
          path="elsewhere/to-folder.txt"
          oldPath="moved/to-folder.txt"
          open
          notes={[]}
          collapsible
          onClick={() => {}}
        />
      </PathLooksContext>,
    );
    assert.match(
      html,
      /<span class="path" data-tip="moved\/to-folder\.txt → elsewhere\/to-folder\.txt" data-tip-said="[^"]*">\{<span class="path-piece"><span class="path-part">moved<\/span><\/span> → <span class="path-piece"><span class="path-part">elsewhere<\/span><\/span>\}\/<span class="path-piece"><span class="path-part colored" style="--file-color:light-dark\(blue, blue\)">to-folder\.txt<\/span><\/span><\/span>/,
    );
  });
});

suite('Renamed files', () => {
  test('draws the placeholder of a diff loading side by side as two columns of bars, each its own, and inline as one', () => {
    const split = renderToStaticMarkup(<DiffSkeleton split rows={9} />);
    const sides = tagsWith(split, 'split-side');
    assert.strictEqual(sides.length, 2);
    assert.strictEqual(tagsWith(split, 'skeleton-row').length, 18);
    const inline = renderToStaticMarkup(
      <DiffSkeleton split={false} rows={9} />,
    );
    assert.strictEqual(tagsWith(inline, 'split-side').length, 0);
    assert.strictEqual(tagsWith(inline, 'skeleton-row').length, 9);
  });
});

suite('Hunk divider', () => {
  test('marks the lines left out between hunks with dots', () => {
    assert.strictEqual(
      renderToStaticMarkup(<HunkDivider />),
      '<div class="hunk-divider"><span class="hunk-dots">⋯</span></div>',
    );
  });
});

suite('Files to view', () => {
  test('leaves viewing a file in a tab of its own to the menu of its path and F3, the header of a file holding no button of its own', () => {
    assert.doesNotMatch(
      renderToStaticMarkup(
        <FileHeader
          path="v.svg"
          open
          notes={[strings.diff.binary]}
          collapsible
          onClick={() => {}}
        />,
      ),
      /<button/,
    );
  });
});

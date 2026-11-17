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

const binaryMarkup = (
  change: 'added' | 'removed' | undefined,
  split: boolean,
) =>
  renderToStaticMarkup(
    <FileNote text="Binary file" change={change} split={split} />,
  );

suite('Binary files', () => {
  test('says a file is binary on each side it has, hatching the other side by side, and tints it inline', () => {
    assert.strictEqual(
      binaryMarkup('added', false),
      '<div class="file-note added">Binary file</div>',
    );
    assert.strictEqual(
      binaryMarkup('added', true),
      '<div class="split-line note-line"><div class="file-note split-side filler"></div><div class="file-note split-side added">Binary file</div></div>',
    );
    assert.strictEqual(
      binaryMarkup('removed', true),
      '<div class="split-line note-line"><div class="file-note split-side removed">Binary file</div><div class="file-note split-side filler"></div></div>',
    );
    assert.strictEqual(
      binaryMarkup(undefined, true),
      '<div class="split-line note-line"><div class="file-note split-side ">Binary file</div><div class="file-note split-side ">Binary file</div></div>',
    );
  });
});

const collapsibleHeader = (collapsible: boolean) =>
  renderToStaticMarkup(
    <FileHeader
      path="a.ts"
      open
      whole={false}
      collapsible={collapsible}
      onClick={() => {}}
    />,
  );

suite('Diff file header', () => {
  test('labels a file shown entire as unchanged, naming no commit, as it may be in the uncommitted changes or a comparison', () => {
    const html = renderToStaticMarkup(
      <FileHeader
        path="a.ts"
        open
        whole
        collapsible={false}
        onClick={() => {}}
      />,
    );
    assert.match(html, /<span class="unchanged">Unchanged<\/span>/);
    assert.doesNotMatch(html, /commit/);
    assert.doesNotMatch(
      renderToStaticMarkup(
        <FileHeader
          path="a.ts"
          open
          whole={false}
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
          whole={false}
          collapsible
          onClick={() => {}}
        />
      </PathLooksContext>,
    );
    assert.match(
      html,
      /<span class="path" title="moved\/to-folder\.txt → elsewhere\/to-folder\.txt">\{<span class="path-piece"><span class="path-part">moved<\/span><\/span> → <span class="path-piece"><span class="path-part">elsewhere<\/span><\/span>\}\/<span class="path-piece"><span class="path-part colored" style="--file-color:light-dark\(blue, blue\)">to-folder\.txt<\/span><\/span><\/span>/,
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

const viewHeader = (onView?: () => void) =>
  renderToStaticMarkup(
    <FileHeader
      path="v.svg"
      open
      whole={false}
      collapsible
      onClick={() => {}}
      onView={onView}
    />,
  );

suite('Files to view', () => {
  test('offers to view a file in a tab of its own only where the diff can tell where to read it from', () => {
    assert.doesNotMatch(viewHeader(), /<button/);
    assert.match(
      viewHeader(() => {}),
      /<button class="nav-button file-header-button" title="View the File in a Tab of Its Own">/,
    );
  });
});

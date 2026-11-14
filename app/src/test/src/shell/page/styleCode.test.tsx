import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { tabSize } from '../../../../lib/page/tabStops';
import {
  allWithClass,
  cascaded,
  rendered,
  withClass,
} from '../../../helpers/cascade';
import {
  DiffViewShown,
  HangingSpacesLine,
  IndentedLine,
  InlineLine,
  SplitLine,
} from '../../../helpers/styleFixtures';
import { diffView, shownRow } from '../../../helpers/styleMarkup';
import {
  cell,
  spaceDots,
  squareDots,
  spaceDotSize,
  spaceDotStart,
  compact,
  looks,
} from './stylesheetFixtures';
import { layoutVariables } from '../../../../tools/git/page/textLayout';

suite('Style', () => {
  test('wraps long lines of code at spaces, breaking a word only where it would not fit, in rows as tall as their lines', () => {
    const inline = shownRow(
      diffView(<DiffViewShown wordWrap />, <InlineLine kind="added" />),
    );
    looks(inline, { width: '100%' });
    looks(withClass(inline, 'text-line'), {
      height: 'auto',
      'min-height': 'var(--diff-line-height)',
    });
    looks(withClass(inline, 'code'), {
      'white-space': 'pre-wrap',
      'overflow-wrap': 'anywhere',
      'min-width': '0',
    });
    const split = shownRow(
      diffView(
        <DiffViewShown sideBySide wordWrap />,
        <SplitLine left="removed" right="added" />,
      ),
    );
    for (const side of allWithClass(split, 'split-code')) {
      looks(withClass(side, 'code'), {
        display: 'block',
        transform: 'none',
        'white-space': 'pre-wrap',
      });
    }
  });

  test('indents the rows a long line wraps onto by its indentation, keeping the indentation on the row with the code it indents', () => {
    looks(
      withClass(
        shownRow(diffView(<DiffViewShown wordWrap />, <IndentedLine />)),
        'code',
      ),
      {
        'padding-left':
          'calc(var(--diff-code-padding) + var(--wrap-indent, 0px))',
        'text-indent': 'calc(-1 * var(--wrap-indent, 0px))',
      },
    );
    looks(
      withClass(
        shownRow(diffView(<DiffViewShown wordWrap />, <IndentedLine />)),
        'lead',
      ),
      { 'white-space': 'pre' },
    );
    looks(
      withClass(
        shownRow(diffView(<DiffViewShown />, <IndentedLine />)),
        'code',
      ),
      {
        'padding-left': undefined,
        'text-indent': undefined,
      },
    );
  });

  test('shows the sign of each tab and other blank of an indented wrapped line on that blank, as the indentation hanging its rows moved the signs aside, squeezing them together', () => {
    const tab = rendered(
      <span className="blank" data-glyph="→">
        {'\t'}
      </span>,
      withClass(
        shownRow(diffView(<DiffViewShown wordWrap />, <IndentedLine />)),
        'lead',
      ),
    );
    looks(tab, { 'text-indent': '0' }, { pseudoElement: '::before' });
  });

  test('counts a column of a code block in a Markdown preview as one character of its font on whole device pixels, spacing its characters to match, as the viewer does, so its boxes keep the code on its grid, as a column of a fraction of a pixel let a row of boxes drift from it', () => {
    looks(
      withClass(
        rendered(
          <div className="markdown">
            <pre>
              <code className="shown">a</code>
            </pre>
          </div>,
        ),
        'shown',
      ),
      {
        '--text-advance': 'round(1ch, var(--device-pixel, 1px))',
        'letter-spacing': 'calc(var(--text-advance) - 1ch)',
      },
    );
  });

  test('lays the code of a code block in a Markdown preview out as a block of its own, so its tabs stop every four columns of its font, as in the viewer and the diff, rather than every eight spaces of the default monospace font of the browser that the pre around it has', () => {
    looks(
      withClass(
        rendered(
          <div className="markdown">
            <pre>
              <code className="shown">{'a\tb'}</code>
            </pre>
          </div>,
        ),
        'shown',
      ),
      { display: 'block', 'tab-size': String(tabSize) },
    );
  });

  test('draws a character in a box exactly as many columns of the text wide as it takes and a line tall, its glyph centered, as our terminal draws it on its grid, in the diff and the viewer alike, never making its line taller, as a shrunk emoji made a wrapped line of the diff two rows tall', () => {
    looks(
      cell(
        shownRow(diffView(<DiffViewShown wordWrap />, <IndentedLine />)),
        'cell',
      ),
      {
        display: 'inline-flex',
        'justify-content': 'center',
        'align-items': 'center',
        width: 'var(--text-advance)',
        height: '1lh',
        'vertical-align': 'top',
      },
    );
    looks(
      cell(
        shownRow(diffView(<DiffViewShown wordWrap />, <IndentedLine />)),
        'cell wide',
      ),
      { width: 'calc(2 * var(--text-advance))' },
    );
    looks(
      cell(
        shownRow(diffView(<DiffViewShown wordWrap />, <IndentedLine />)),
        'cell zero',
      ),
      { width: '0' },
    );
    looks(withClass(diffView(<DiffViewShown />), 'diff-view'), {
      '--text-advance': 'var(--diff-advance)',
    });
  });

  test('draws a run of spaces shown as square dots in its own background, each as wide as it is tall in whole device pixels and starting on a whole device pixel in the middle of each advance of the text, with no box over each space, as a box over every space of a padded table slowed scrolling down and let the browser break a run onto rows of its own', () => {
    const run = withClass(
      shownRow(diffView(<DiffViewShown wordWrap />, <IndentedLine />)),
      'spaces',
    );
    looks(run, {
      position: undefined,
      ...squareDots,
    });
    assert.strictEqual(compact(cascaded(run, 'background-image')), spaceDots);
    assert.strictEqual(compact(cascaded(run, '--space-dot')), spaceDotSize);
    assert.strictEqual(
      compact(cascaded(run, '--space-dot-start')),
      spaceDotStart,
    );
    looks(run, { content: undefined }, { pseudoElement: '::before' });
  });

  test('marks the spaces hanging at the end of a wrapped row of the diff and the viewer with the same dots, on that row, leaving them to the spaces drawn in the diff while whitespace is shown', () => {
    const viewer = withClass(
      rendered(
        <div className="viewer-row">
          <span className="viewer-wrap-spaces" />
        </div>,
      ),
      'viewer-wrap-spaces',
    );
    const dotted = squareDots;
    looks(
      withClass(
        shownRow(
          diffView(
            <DiffViewShown wordWrap showWhitespace={false} />,
            <HangingSpacesLine />,
          ),
        ),
        'wrap-spaces',
      ),
      {
        position: 'absolute',
        height: 'var(--diff-line-height)',
        display: undefined,
        ...dotted,
      },
    );
    looks(
      withClass(
        shownRow(
          diffView(
            <DiffViewShown wordWrap showWhitespace />,
            <HangingSpacesLine />,
          ),
        ),
        'wrap-spaces',
      ),
      { display: 'none' },
    );
    looks(viewer, {
      position: 'absolute',
      top: '0',
      height: '100%',
      'pointer-events': 'none',
      ...dotted,
    });
    for (const marks of [
      withClass(
        shownRow(
          diffView(
            <DiffViewShown wordWrap showWhitespace={false} />,
            <HangingSpacesLine />,
          ),
        ),
        'wrap-spaces',
      ),
      viewer,
    ]) {
      assert.strictEqual(
        compact(cascaded(marks, 'background-image')),
        spaceDots,
      );
    }
  });

  test('ends the lines scrolled sideways before the minimap, keeping their rows tinted under it, but wraps lines under it, as text goes under the scrollbars everywhere else, with room for the sign of a break, so both sides wrap alike', () => {
    for (const wordWrap of [false, true]) {
      const clear = wordWrap
        ? 'calc(2 * var(--diff-code-padding) + 2ch)'
        : 'calc(var(--diff-code-padding) + var(--minimap-width))';
      looks(
        withClass(
          shownRow(
            diffView(
              <DiffViewShown wordWrap={wordWrap} />,
              <InlineLine kind="added" />,
            ),
          ),
          'code',
        ),
        { 'padding-right': clear },
      );
      const [left, right] = allWithClass(
        shownRow(
          diffView(
            <DiffViewShown sideBySide wordWrap={wordWrap} />,
            <SplitLine left="" right="" />,
          ),
        ),
        'split-side',
      ).map((side) => withClass(side, 'code'));
      looks(right, { 'padding-right': clear });
      looks(left, {
        'padding-right': wordWrap
          ? cascaded(right, 'padding-right')
          : undefined,
      });
    }
  });

  test('draws a tab in the code as wide as the wrapping and the hidden changes count it', () => {
    for (const wordWrap of [false, true]) {
      looks(
        withClass(
          shownRow(
            diffView(
              <DiffViewShown wordWrap={wordWrap} />,
              <InlineLine kind="context" />,
            ),
          ),
          'code',
        ),
        { 'tab-size': 'var(--diff-tab-size)' },
      );
    }
    assert.strictEqual(layoutVariables['--diff-tab-size'], String(tabSize));
  });
});

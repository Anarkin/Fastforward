import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { tabSize } from '../../../../lib/page/tabStops';
import { diffView, shownRow } from '../../../helpers/styleMarkup';
import { cascaded } from '../../../helpers/cascade';
import { bodyVariable, compact, looks } from './stylesheetFixtures';
import { layoutVariables } from '../../../../tools/git/page/textLayout';
import { allWithClass, rendered, withClass } from '../../../helpers/markup';
import {
  DiffViewShown,
  IndentedLine,
  InlineLine,
  SplitLine,
} from '../../../helpers/styleDiffFixtures';

const inlineCode = (wordWrap: boolean) =>
  withClass(
    shownRow(
      diffView(
        <DiffViewShown wordWrap={wordWrap} />,
        <InlineLine kind="added" />,
      ),
    ),
    'code',
  );
const sideCodes = (wordWrap: boolean) =>
  allWithClass(
    shownRow(
      diffView(
        <DiffViewShown sideBySide wordWrap={wordWrap} />,
        <SplitLine left="" right="" />,
      ),
    ),
    'split-side',
  ).map((side) => withClass(side, 'code'));

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

  test('ends the lines scrolled sideways before the minimap, keeping their rows tinted under it, and wraps the text of the diff, the viewer and the editor inside one right padding, two columns for a blank hanging at the end of a row and the sign of its break, then what covers the edge, the minimap or the scrollbar, and a gap, so no text runs under either and both sides wrap alike', () => {
    const beforeMinimap =
      'calc(var(--diff-code-padding) + var(--minimap-width))';
    looks(inlineCode(false), { 'padding-right': beforeMinimap });
    const [left, right] = sideCodes(false);
    looks(right, { 'padding-right': beforeMinimap });
    looks(left, { 'padding-right': undefined });

    const editor = withClass(
      rendered(
        <div className="cm-editor editor-text">
          <div className="cm-scroller">
            <div className="cm-content cm-lineWrapping" />
          </div>
        </div>,
      ),
      'cm-content',
    );
    for (const wrapped of [
      inlineCode(true),
      ...sideCodes(true),
      rendered(<div className="viewer-rows wrapped numbered" />),
      editor,
    ]) {
      assert.strictEqual(
        compact(cascaded(wrapped, 'padding-right')),
        'calc(2 * var(--text-advance) + var(--wrap-cover) + var(--wrap-gap))',
        wrapped.classes.join(' '),
      );
    }
    looks(withClass(diffView(<DiffViewShown wordWrap />), 'diff-view'), {
      '--wrap-cover': 'var(--minimap-width)',
    });
    assert.deepStrictEqual(
      [bodyVariable('wrap-cover'), bodyVariable('wrap-gap')],
      ['var(--scrollbar-size)', '8px'],
    );
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

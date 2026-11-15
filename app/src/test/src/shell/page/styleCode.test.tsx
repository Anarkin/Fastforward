import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { tabSize } from '../../../../lib/page/tabStops';
import { cascaded } from '../../../helpers/cascade';
import { diffView, shownRow } from '../../../helpers/styleMarkup';
import { looks } from './stylesheetFixtures';
import { layoutVariables } from '../../../../tools/git/page/textLayout';
import { allWithClass, rendered, withClass } from '../../../helpers/markup';
import {
  DiffViewShown,
  IndentedLine,
  InlineLine,
  SplitLine,
} from '../../../helpers/styleDiffFixtures';

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

import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { tabSize } from '../../../../lib/page/tabStops';
import {
  cascaded,
  rendered,
  withClass,
  type MarkupElement,
} from '../../../helpers/cascade';
import {
  DiffViewShown,
  IndentedLine,
  DiffRow,
} from '../../../helpers/styleFixtures';
import { diffView, shownRow } from '../../../helpers/styleMarkup';
import { compact, looks, noop } from './stylesheetFixtures';
import { TerminalTool } from '../../../../tools/terminal/page/tool';
import { createElement } from 'react';
import { Code } from '../../../../tools/git/page/codeMarks';
import { BreakMarks } from '../../../../tools/git/page/wrapMarks';

function HangingSpacesLine() {
  return (
    <DiffRow>
      <div className="diff-line text-line added">
        <span className="number">1</span>
        <span className="number">1</span>
        <Code
          text="a   b"
          syntax={[]}
          words={[]}
          wordClass="word-added"
          finds={[]}
          current={undefined}
          whitespace={false}
        />
        <span className="wrap-marks">
          <BreakMarks
            breaks={[
              {
                end: 4,
                blanks: [1, 2, 3].map((column) => ({ column, tab: false })),
              },
            ]}
            numbers={2}
            lineHeight={18}
          />
        </span>
      </div>
    </DiffRow>
  );
}

function cell(row: MarkupElement, className: string): MarkupElement {
  return withClass(
    rendered(
      createElement('span', { className }, '😀'),
      withClass(row, 'code'),
    ),
    'cell',
  );
}

const spaceDots =
  'linear-gradient(to right, transparent var(--space-dot-start), var(--muted-foreground) var(--space-dot-start) calc(var(--space-dot-start) + var(--space-dot)), transparent 0)';

const squareDots = {
  'background-size': 'var(--text-advance) var(--space-dot)',
  'background-position': '0 50%',
  'background-repeat': 'repeat-x',
};

const spaceDotSize =
  'max(var(--device-pixel, 1px), round(0.16em, var(--device-pixel, 1px)))';

const spaceDotStart =
  'round(down, (var(--text-advance) - var(--space-dot)) / 2, var(--device-pixel, 1px))';

suite('Style', () => {
  test('makes a cell of the terminal as tall and as wide as a character of the diff, so code looks the same in both', () => {
    const panel = rendered(
      <TerminalTool active post={noop} listen={() => noop} />,
    );
    assert.strictEqual(
      compact(cascaded(panel, '--terminal-row-height')),
      compact(cascaded(diffView(<DiffViewShown />), '--diff-line-height')),
    );
    assert.strictEqual(
      compact(cascaded(panel, '--terminal-advance')),
      compact(cascaded(diffView(<DiffViewShown />), '--diff-advance')),
    );
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
});

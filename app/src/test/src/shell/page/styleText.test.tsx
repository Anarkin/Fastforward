import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { tabSize } from '../../../../lib/page/tabStops';
import { dotLook } from '../../../../lib/page/dotLook';
import { cascaded } from '../../../helpers/cascade';
import { diffView, shownRow } from '../../../helpers/styleMarkup';
import { compact, looks, noop } from './stylesheetFixtures';
import { TerminalTool } from '../../../../tools/terminal/page/tool';
import { createElement } from 'react';
import { Code } from '../../../../components/diff/page/codeMarks';
import { BreakMarks } from '../../../../components/diff/page/wrapMarks';
import {
  rendered,
  withClass,
  type MarkupElement,
} from '../../../helpers/markup';
import {
  DiffViewShown,
  IndentedLine,
  DiffRow,
} from '../../../helpers/styleDiffFixtures';

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

const marked = (mark: React.ReactElement, className: string) =>
  withClass(
    rendered(
      <div className="cm-editor editor-text">
        <div className="cm-scroller">
          <div className="cm-layer break-mark-layer">{mark}</div>
        </div>
      </div>,
    ),
    className,
  );

const colorOf = (box: string, part: string) =>
  cascaded(
    withClass(
      rendered(
        <div className={box}>
          <span className="path-piece">
            <span className={part}>x</span>/
          </span>
        </div>,
      ),
      ...part.split(' '),
    ),
    'color',
  );

suite('Style', () => {
  test('draws each part of a path and the separator after it in the color of the text, whatever color the box around it has, so a path looks alike everywhere, a file of a color group in its color and a hidden part dimmed in its own', () => {
    const boxes = [
      'open-with-folders',
      'transfer-current',
      'name-value',
      'menu-item',
      'file-header',
      'row tree-row file',
      'commander-tile-name',
    ];
    assert.deepStrictEqual(
      boxes.map((box) => [
        colorOf(box, 'path-piece'),
        colorOf(box, 'path-part'),
        colorOf(box, 'path-part colored'),
        colorOf(box, 'path-part hidden'),
      ]),
      boxes.map(() => [
        'var(--color-foreground)',
        'var(--color-foreground)',
        'var(--file-color)',
        'color-mix( in srgb, var(--file-color, var(--color-foreground)) var(--color-hidden-file), transparent )',
      ]),
    );
  });

  test('draws a line in the color of the line over the status of a column at the end of the column of line numbers, in the editor, the diff, side by side too, and the viewer, so the numbers stand apart from the text', () => {
    const status = rendered(<div className="column-status" />);
    const line = cascaded(status, 'box-shadow')?.split(' ').at(-1);
    assert.strictEqual(line, 'var(--color-border)');
    const edge = `inset var(--hairline) 0 ${line}`;
    const inline = rendered(
      <div className="diff-line">
        <span className="number">1</span>
        <span className="number">1</span>
        <span className="code">a</span>
      </div>,
    );
    looks(withClass(inline, 'code'), { 'box-shadow': edge });
    const split = rendered(
      <div className="diff-line split-side">
        <span className="number">1</span>
        <span className="split-code">
          <span className="code">a</span>
        </span>
      </div>,
    );
    looks(withClass(split, 'split-code'), { 'box-shadow': edge });
    looks(withClass(split, 'code'), { 'box-shadow': undefined });
    const editor = rendered(
      <div className="cm-editor editor-text">
        <div className="cm-scroller">
          <div className="cm-gutters">
            <div className="cm-gutter cm-lineNumbers" />
          </div>
        </div>
      </div>,
    );
    looks(withClass(editor, 'cm-lineNumbers'), {
      'box-shadow': `inset calc(-1 * var(--hairline)) 0 ${line}`,
    });
    const viewer = rendered(<div className="viewer-rows numbered" />);
    looks(viewer, {
      'min-height': '100%',
      'background-image': `linear-gradient(${line}, ${line})`,
      'background-position':
        'calc(var(--line-number-width) - var(--hairline)) 0',
      'background-size': 'var(--hairline) 100%',
      'background-repeat': 'no-repeat',
    });
  });

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

  test('draws the spaces shown in the diff and the viewer as square dots on one layer over the line, each as tall as it is wide in whole device pixels and starting on a whole device pixel in the middle of its row, where the layer puts it across, with no element over each space or run, as an element a space of a line of prose slowed scrolling down', () => {
    const layer = withClass(
      shownRow(
        diffView(
          <DiffViewShown wordWrap />,
          <DiffRow>
            <div className="diff-line text-line added">
              <span className="wrap-marks">
                <BreakMarks
                  breaks={[]}
                  dots={[[0, 1]]}
                  look={dotLook(14, 8, 1)}
                  numbers={2}
                  lineHeight={17}
                />
              </span>
            </div>
          </DiffRow>,
        ),
      ),
      'dot-rows',
    );
    looks(layer, {
      position: 'absolute',
      top: '0',
      right: '0',
      bottom: '0',
      'pointer-events': 'none',
      color: 'var(--muted-foreground)',
      'background-size': '100% var(--space-dot)',
      'background-repeat': 'no-repeat',
      'mask-image': undefined,
    });
    assert.deepStrictEqual(
      ['--dot-row', '--dot-top'].map((name) => compact(cascaded(layer, name))),
      [
        'var(--diff-line-height)',
        'round(down, (var(--dot-row) - var(--space-dot)) / 2, var(--device-pixel, 1px))',
      ],
    );
    assert.strictEqual(compact(cascaded(layer, '--space-dot')), spaceDotSize);
    assert.strictEqual(
      compact(cascaded(layer, '--space-dot-start')),
      spaceDotStart,
    );
    assert.strictEqual(
      cascaded(
        withClass(
          rendered(
            <div className="viewer-row">
              <span className="dot-rows" />
            </div>,
          ),
          'dot-rows',
        ),
        '--dot-row',
      ),
      'var(--viewer-row-height)',
    );
  });

  test('keeps the run of spaces of a line too long to dot on one layer dotted in its own background, each dot as on the layer', () => {
    const run = withClass(
      rendered(
        <div className="diff-view show-whitespace">
          <span className="spaces"> </span>
        </div>,
      ),
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

  test('marks the breaks of the rows of a line wrapped in the editor as the diff and the viewer mark them, the sign muted and centered in a column of the text, the spaces hanging at the end of a row dotted the same, none of it taking the pointer or a selection', () => {
    looks(marked(<div className="wrap-break" />, 'break-mark-layer'), {
      'pointer-events': 'none',
      'user-select': 'none',
      color: 'var(--muted-foreground)',
    });
    for (const sign of ['wrap-break', 'wrap-blank']) {
      looks(marked(<div className={sign} />, sign), {
        width: 'var(--text-advance)',
        height: '1lh',
        'text-align': 'center',
      });
    }
    const spaces = marked(<div className="wrap-spaces" />, 'wrap-spaces');
    looks(spaces, { height: '1lh', ...squareDots });
    assert.strictEqual(
      compact(cascaded(spaces, 'background-image')),
      spaceDots,
    );
  });
});

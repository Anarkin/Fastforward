import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { tabSize } from '../../../../lib/page/tabStops';
import { cascaded } from '../../../helpers/cascade';
import { diffView, shownRow } from '../../../helpers/styleMarkup';
import { compact, looks, noop } from './stylesheetFixtures';
import { TerminalTool } from '../../../../tools/terminal/page/tool';
import { createElement } from 'react';
import {
  rendered,
  withClass,
  type MarkupElement,
} from '../../../helpers/markup';
import { DiffViewShown, InlineLine } from '../../../helpers/styleDiffFixtures';

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

  test('draws a line in the color of the line over the status of a column at the end of the column of line numbers, in the editor, the diff, side by side too, and the viewer, on a strip of its own there that stays put over the text scrolled sideways, so the numbers stand apart from the text', () => {
    const status = rendered(<div className="column-status" />);
    const line = cascaded(status, 'box-shadow')?.split(' ').at(-1);
    assert.strictEqual(line, 'var(--color-border)');
    const edge = `inset var(--hairline) 0 ${line}`;
    const inline = rendered(
      <div className="diff-line">
        <span className="number">1</span>
        <span className="number">1</span>
        <span className="split-code">
          <span className="code">a</span>
        </span>
      </div>,
    );
    looks(withClass(inline, 'split-code'), { 'box-shadow': edge });
    looks(withClass(inline, 'code'), { 'box-shadow': undefined });
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
    const viewer = rendered(<div className="viewer-gutter numbered" />);
    looks(viewer, {
      position: 'absolute',
      top: '0',
      bottom: 'var(--line-below, 0px)',
      width: 'calc(var(--line-number-width) + var(--line-number-gap))',
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
        shownRow(
          diffView(<DiffViewShown wordWrap />, <InlineLine kind="added" />),
        ),
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
        shownRow(
          diffView(<DiffViewShown wordWrap />, <InlineLine kind="added" />),
        ),
        'cell wide',
      ),
      { width: 'calc(2 * var(--text-advance))' },
    );
    looks(
      cell(
        shownRow(
          diffView(<DiffViewShown wordWrap />, <InlineLine kind="added" />),
        ),
        'cell zero',
      ),
      { width: '0' },
    );
    looks(withClass(diffView(<DiffViewShown />), 'diff-view'), {
      '--text-advance': 'var(--diff-advance)',
    });
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

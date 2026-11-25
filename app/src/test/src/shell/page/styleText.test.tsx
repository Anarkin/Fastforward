import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { cascaded } from '../../../helpers/cascade';
import { diffView } from '../../../helpers/styleMarkup';
import { compact, looks, noop } from './stylesheetFixtures';
import { TerminalTool } from '../../../../tools/terminal/page/tool';
import { rendered, withClass } from '../../../helpers/markup';
import { DiffViewShown } from '../../../helpers/styleDiffFixtures';

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

  test('colors the box of a path cut short as its last part is colored, so the ellipsis that cuts it is in the color of the name it cuts, in the rows of a tree and the headers of a diff alike, leaving it a box of text that the ellipsis cuts, as a class the commander had already made it a flex box that cut nothing', () => {
    for (const box of ['row tree-row file', 'file-header']) {
      const styleOfEnd = (end: string, property: string) =>
        cascaded(
          withClass(
            rendered(
              <div className={box}>
                <span className={`path ${end}`}>x</span>
              </div>,
            ),
            ...end.split(' '),
          ),
          property,
        );
      const colorOfEnd = (end: string) => styleOfEnd(end, 'color');
      assert.deepStrictEqual(
        [
          styleOfEnd('path-cut colored', 'display'),
          styleOfEnd('path-cut colored', 'text-overflow'),
        ],
        [undefined, 'ellipsis'],
        box,
      );
      assert.deepStrictEqual(
        [
          colorOfEnd('path-cut'),
          colorOfEnd('path-cut colored'),
          colorOfEnd('path-cut hidden'),
        ],
        [
          'var(--color-foreground)',
          'var(--file-color)',
          'color-mix( in srgb, var(--file-color, var(--color-foreground)) var(--color-hidden-file), transparent )',
        ],
        box,
      );
    }
  });

  test('draws a line in the color of the line over the status of a column at the end of the column of line numbers, in the diff, side by side too, and the viewer, on a strip of its own there that stays put over the text scrolled sideways, so the numbers stand apart from the text', () => {
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

  test('names a file on a row one row of monospace text tall, as a line of the diff and its header are, with no line under it, its end clear of the wide scrollbar of the text views, so the name stands alike in every tool, as the rows took the height of their text alone and those of the viewer and the editor a pixel more than the header of the diff', () => {
    const row = withClass(
      rendered(
        <section className="column">
          <div className="path-row" />
        </section>,
      ),
      'path-row',
    );
    assert.strictEqual(
      compact(cascaded(row, '--path-row-height')),
      compact(cascaded(diffView(<DiffViewShown />), '--diff-line-height')),
    );
    looks(row, {
      height: 'var(--path-row-height)',
      'line-height': 'var(--path-row-height)',
      'border-bottom': undefined,
    });
    assert.strictEqual(cascaded(row, '--scrollbar-across'), undefined);
    assert.strictEqual(
      cascaded(
        withClass(
          rendered(
            <section className="column viewer">
              <div className="path-row" />
            </section>,
          ),
          'path-row',
        ),
        '--scrollbar-across',
      ),
      'var(--scrollbar-marked-size)',
    );
    looks(rendered(<div className="file-header" />), {
      height: 'var(--diff-file-height)',
      'line-height': 'var(--diff-file-height)',
      'border-bottom': undefined,
    });
  });

  test('makes a cell of the terminal as tall and as wide as a character of the diff, so code looks the same in both', () => {
    const panel = withClass(
      rendered(<TerminalTool active post={noop} listen={() => noop} />),
      'terminal-panel',
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
      { display: 'block', 'tab-size': 'var(--tab-size)' },
    );
  });

  test('counts a column of the text of a diff as the advance the diff measures for its characters, so what stands on columns of the text stands on those of the diff', () => {
    looks(withClass(diffView(<DiffViewShown />), 'diff-view'), {
      '--text-advance': 'var(--diff-advance)',
    });
  });
});

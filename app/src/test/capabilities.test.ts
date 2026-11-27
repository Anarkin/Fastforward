import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import { read, sourceFiles } from './helpers/sourceGraph';

const codeFiles = sourceFiles.filter((file) => /\.tsx?$/.test(file));

const holding = (pattern: RegExp): string[] =>
  codeFiles.filter((file) => pattern.test(read(file))).toSorted();

function heldBy(
  pattern: RegExp,
  owners: readonly string[],
  waiting: Readonly<Record<string, string>> = {},
): void {
  const others = holding(pattern).filter((file) => !owners.includes(file));
  assert.deepStrictEqual(
    {
      owners: owners.filter((file) => !holding(pattern).includes(file)),
      others,
    },
    { owners: [], others: Object.keys(waiting).toSorted() },
  );
}

suite('Capabilities', () => {
  test('lets only the cells component touch the GPU, its device, the context of a canvas, its pipelines and its shaders, so a view of the GPU a tool adds draws by the cells rather than by an engine of its own', () => {
    heldBy(
      /navigator\.gpu|requestAdapter\(|getContext\('webgpu'\)|createRenderPipeline\(|createShaderModule\(/,
      [
        'components/cells/page/cellSurface.ts',
        'components/cells/page/gpuDevice.ts',
        'components/cells/page/shapeLayer.ts',
      ],
    );
  });

  test('makes a surface of the GPU only in the cells, the pool of CellView for a text and one held surface for a list or a board, made anew for a new device and its canvas put in its host alike, so a new view takes one of them rather than a surface of its own', () => {
    heldBy(/new CellSurface\(/, [
      'components/cells/page/cellView.ts',
      'components/cells/page/heldSurface.ts',
    ]);
    heldBy(/new HeldSurface\(/, [
      'components/cells/page/listCanvas.ts',
      'tools/canvas/page/surface.ts',
    ]);
  });

  test('draws a glyph only into the atlases of the cells, so text drawn by the GPU is drawn alike everywhere, the icons of a bubble alone drawn by a canvas of the CPU, as ARCHITECTURE records', () => {
    heldBy(/\.fillText\(/, [
      'components/cells/page/glyphAtlas.ts',
      'components/cells/page/runAtlas.ts',
      'tools/git/page/bubbleCanvas.ts',
    ]);
  });

  test('measures text only by the widths of the library and the atlases of the cells, the room of a bubble, the scale of a list and the ascent of a run by one measurer of the library, so every part agrees on how wide a text is, the terminal alone measuring the cell xterm.js lays its grid on', () => {
    heldBy(/\.measureText\(/, [
      'components/cells/page/glyphAtlas.ts',
      'components/cells/page/runAtlas.ts',
      'lib/page/textWidths.ts',
      'tools/terminal/page/cells.ts',
    ]);
  });

  test('reads the ground a text stands on from the page by one look of the cells, every layer up to the first opaque one blended as the page blends them and the tints of its gradients over them, so every view draws on the color the page shows, rather than by a reading of each view, the canvas having taken the first layer alone over black', () => {
    heldBy(/backgroundColor\)/, ['components/cells/page/cellLook.ts']);
  });

  test('glides a list, a column, the viewer and the canvas only through the one glider of the library, so every smooth scroll takes as long, eases alike and is redirected from where it is, the terminal handing its moment to xterm.js, which glides its own screen', () => {
    heldBy(/\browGlide\b(?!')/, [
      'lib/page/glide.ts',
      'tools/terminal/page/view.ts',
    ]);
    heldBy(/\bgliderOf\(/, [
      'lib/page/columnScroll.ts',
      'lib/page/rowScroll.ts',
      'tools/canvas/page/panner.ts',
      'tools/viewer/page/rowGlide.ts',
    ]);
  });

  test('marks the track of a scrollbar only through the marks of the library, the matches of a find and its current one worked out once for the editor, the viewer and a Markdown preview, the diff joining its runs of changes by the same joiner, and every mark made of one class and place, so a mark looks and stands alike in every view', () => {
    heldBy(/scrollbar-mark\b(?!s)/, ['lib/page/trackMarks.ts']);
    heldBy(/\btickJoiner\(/, [
      'components/diff/page/changeMarks.ts',
      'lib/page/scrollbarTicks.ts',
    ]);
  });

  test('hides an element the page reads a look from by one maker of probes of the cells, which every list, view and canvas takes its rows to read from, the shell measuring the fonts and the cursor of a text box by boxes of its own outside any view', () => {
    heldBy(/visibility(?: = |: )'hidden'/, [
      'components/cells/page/listLooks.ts',
      'shell/page/textCursor.ts',
      'shell/page/textHeights.ts',
    ]);
  });

  test('saves a file whole only by the saver of the library, through a file beside it flushed to the disk before it takes the place of the old one, which the editor, the canvas, the settings, the state of the app and the places of a PDF write through, rather than by a writer of each', () => {
    heldBy(/\.sync\(\)/, ['lib/main/fileSaving.ts']);
  });

  test('opens a link outside the app only by the open handler of a window, which lets out https and mailto alone, the page asking for it as a Markdown preview, About and the link nodes of a canvas do, and the page of a release the updater names, rather than by a page or a tool of its own', () => {
    heldBy(/\bshell\.openExternal\(/, [
      'boot/browserWindow.ts',
      'boot/main.ts',
    ]);
  });

  test('reaches the web from the main process only for the titles of the link nodes of a canvas, read by its reader over https alone to addresses of the web, a move at a time, a head of the page at most and within a time, beside the files of the app it serves its pages, rather than by a fetch of each part', () => {
    heldBy(/\bnet\.fetch\(/, ['boot/appProtocol.ts']);
    heldBy(/\bnet\.request\(/, ['boot/canvasHost.ts']);
    heldBy(/\breadTitle\(/, [
      'boot/canvasHost.ts',
      'tools/canvas/main/pageTitles.ts',
    ]);
  });

  test('counts the cells of a character by the one table of the grapheme add-on of the terminal, which the views read through the cell table of the library and the terminal loads on its page and in its screens of the main process, so a view never counts a character by a table of its own', () => {
    heldBy(/@xterm\/addon-unicode-graphemes/, [
      'lib/page/cellTable.ts',
      'tools/terminal/main/graphemes.ts',
      'tools/terminal/page/view.ts',
    ]);
  });

  test('starts every watch of the file system by the library, a folder or a tree of folders, so every watch takes the same options, none keeping the app from quitting, and each tool keeps only what it does once told of a change or an error', () => {
    heldBy(/\bfs\.watch\(/, ['lib/main/watch.ts']);
  });
});

import * as assert from 'node:assert';
import { createElement } from 'react';
import { suite, test } from 'vitest';
import { parsePatch } from '../../../../lib/page/diff';
import type { LoadedText } from '../../../../lib/page/sideTexts';
import {
  usePrefetchedColors,
  useSyntax,
} from '../../../../lib/page/diffSyntax';
import { keepColors, keptColorsOf } from '../../../../lib/page/keptColors';
import type { SyntaxRange } from '../../../../lib/page/syntaxEngine';
import { packedPart } from '../../../../lib/page/syntaxParts';
import {
  workerSeen,
  inPage,
  answered,
  comment,
  blobs,
  keptPatch,
  gappedPatch,
} from '../../tools/git/page/syntaxFixtures';

suite('Syntax', () => {
  test('colors a diff by the colors kept of its blobs in the render before its first paint, rather than once the worker answers, the colors the worker gives from the hunks alone not taking their place unless they come from after a language loaded', async () => {
    const files = keptPatch('7', '8');
    const lines = [comment(8), comment(6), comment(8), comment(6)];
    keepColors('typescript', '8'.repeat(40), packedPart(lines, 0, true), 30);
    workerSeen.posted.length = 0;
    await inPage(async (render) => {
      const shown: ReadonlyMap<string, readonly SyntaxRange[]>[] = [];
      const texts = new Map<string, LoadedText>();
      const open = new Set([0]);
      function Diff() {
        shown.push(useSyntax(files, undefined, texts, open));
        return null;
      }
      await render(createElement(Diff));
      assert.deepStrictEqual(Object.fromEntries(shown.at(-1) ?? []), {
        '0:1': lines[2],
        '0:2': lines[3],
      });
      const job = workerSeen.posted.find(
        (message) => message.type === 'color',
      )?.job;
      assert.ok(job !== undefined);
      const keyword = [{ start: 0, end: 3, kind: 'keyword' as const }];
      await answered({
        type: 'colors',
        job,
        generations: { typescript: 30 },
        ranges: [
          ['0:0', keyword],
          ['0:1', keyword],
        ],
      });
      assert.deepStrictEqual(Object.fromEntries(shown.at(-1) ?? []), {
        '0:0': keyword,
        '0:1': lines[2],
        '0:2': lines[3],
      });
      await answered({
        type: 'colors',
        job,
        generations: { typescript: 31, json: 100 },
        ranges: [['0:2', keyword]],
      });
      assert.deepStrictEqual(Object.fromEntries(shown.at(-1) ?? []), {
        '0:0': keyword,
        '0:1': lines[2],
        '0:2': keyword,
      });
    });
  });

  test('colors a diff read ahead in the background, keeping the colors of each whole text by its blob, so the diff is colored in its first frame once it is shown', async () => {
    const patch = gappedPatch.replace(
      `${blobs.old}..${blobs.new}`,
      `${'c'.repeat(40)}..${'d'.repeat(40)}`,
    );
    const texts = new Map<string, LoadedText>([
      [
        'old:a.ts',
        { blob: 'c'.repeat(40), text: '/* start\nmiddle\nold = 1;\nend */\n' },
      ],
      [
        'new:a.ts',
        { blob: 'd'.repeat(40), text: '/* start\nmiddle\nnew = 2;\nend */\n' },
      ],
    ]);
    const colors = [[], [], comment(8), comment(6)];
    workerSeen.posted.length = 0;
    function Ahead() {
      usePrefetchedColors(patch, texts, true);
      return null;
    }
    await inPage(async (render) => {
      await render(createElement(Ahead));
      const asked = workerSeen.posted.find(
        (message) => message.type === 'color',
      );
      assert.ok(asked?.type === 'color');
      assert.strictEqual(asked.background, true);
      const newSide = asked.sources.findIndex(
        ({ lines }) => lines[2] === 'new = 2;',
      );
      await answered({
        type: 'entire',
        job: asked.job,
        generation: 40,
        source: newSide,
        part: packedPart(colors, 0, true),
      });
    });
    assert.deepStrictEqual(
      Object.fromEntries(keptColorsOf(parsePatch(patch))),
      {
        '0:1': colors[2],
        '0:2': colors[3],
      },
    );
  });
});

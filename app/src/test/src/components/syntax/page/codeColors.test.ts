import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  partLines,
  type CodePart,
} from '../../../../../components/syntax/page/parts';
import { waitFor } from '../../../../helpers/fixtures';
import { codeLines, onTickingClock, warmsUpTheGrammar } from './fixtures';
import { loadLanguages } from '../../../../../components/syntax/page/grammars';
import type { SyntaxRange } from '../../../../../components/syntax/page/engine';
import { colorCode } from '../../../../../components/syntax/page/codeColors';

function coloredCode(
  language: string,
  code: string,
  later: (run: () => void) => void = (run) => setTimeout(run),
): Promise<{
  readonly lines: SyntaxRange[][] | undefined;
  readonly parts: readonly CodePart[];
}> {
  return new Promise((resolve) => {
    const parts: CodePart[] = [];
    colorCode(
      language,
      code,
      (part) => {
        if (part === undefined) {
          resolve({ lines: undefined, parts });
          return;
        }
        parts.push(part);
        if (part.done) {
          resolve({ lines: parts.flatMap(partLines), parts });
        }
      },
      later,
    );
  });
}

suite('Code in documents', () => {
  warmsUpTheGrammar();

  test('colors a code block by its language, named or aliased, and nothing in an unknown one', async () => {
    const { lines } = await coloredCode('TS', 'const a = 1;\n// done');
    assert.deepStrictEqual(lines?.[0]?.[0], {
      start: 0,
      end: 5,
      kind: 'keyword',
    });
    assert.deepStrictEqual(lines?.[1], [{ start: 0, end: 7, kind: 'comment' }]);
    assert.strictEqual(
      (await coloredCode('no-such-language', 'a')).lines,
      undefined,
    );
  });

  test('colors code of any length a slice of time at a time, so other jobs go on between, sending its lines in parts as they are done, each part going on from the one before and the last done', async () => {
    let slices = 0;
    const { lines, parts } = await coloredCode('ts', codeLines(6000), (run) => {
      slices += 1;
      setTimeout(run);
    });

    assert.strictEqual(lines?.length, 6001);
    assert.ok(slices > 1, String(slices));
    assert.deepStrictEqual(
      parts.map((part) => part.from),
      parts.map((_, index) =>
        parts
          .slice(0, index)
          .reduce((count, part) => count + part.ends.length, 0),
      ),
    );
    assert.deepStrictEqual(
      parts.map((part) => part.done),
      parts.map((_, index) => index === parts.length - 1),
    );
  });

  test('sends the lines of its first slice of code at once, and those after at most once a frame', async () => {
    await loadLanguages(['typescript']);
    const parts: CodePart[] = [];
    const slices: (() => void)[] = [];
    const started = performance.now();
    colorCode(
      'ts',
      Array<string>(6000).fill('let sentAtOnce = 1;').join('\n'),
      (part) => {
        if (part !== undefined) {
          parts.push(part);
        }
      },
      (slice) => slices.push(slice),
    );
    await waitFor(() => slices.length > 0, 'the first slice');
    onTickingClock(started, () => {
      slices.shift()?.();
      slices.shift()?.();
    });
    assert.deepStrictEqual(
      parts.map(({ from, done }) => ({ from, done })),
      [{ from: 0, done: false }],
    );
  });

  test('colors a line of a code block of 20000 characters, but not one over 20000, as VS Code does, as minified lines take long to tokenize', async () => {
    const { lines } = await coloredCode(
      'ts',
      `a =${' '.repeat(19995)}1;\na =${' '.repeat(19996)}1;`,
    );
    assert.deepStrictEqual(lines?.[0], [
      { start: 2, end: 3, kind: 'keyword' },
      { start: 19998, end: 19999, kind: 'number' },
      { start: 19999, end: 20000, kind: 'keyword' },
    ]);
    assert.deepStrictEqual(lines[1], []);
  });

  test('keeps the colors of a code block, so a preview shown again colors none of its blocks again, sending them in one part at once', async () => {
    const code = 'const kept = 1;';
    let slices = 0;
    const later = (run: () => void) => {
      slices += 1;
      setTimeout(run);
    };
    const first = await coloredCode('ts', code, later);
    const tokenized = slices;
    const again = await coloredCode('typescript', code, later);

    assert.ok(tokenized > 0);
    assert.strictEqual(slices, tokenized);
    assert.deepStrictEqual(again.lines, first.lines);
    assert.strictEqual(again.parts.length, 1);
  });
});

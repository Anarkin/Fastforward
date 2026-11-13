import * as assert from 'node:assert';
import { suite, test } from 'vitest';
import {
  colorEdited,
  type LineRanges,
  type SyntaxRange,
} from '../../ui/syntaxEngine';
import { partLines, type CodePart } from '../../ui/syntaxParts';

interface Coloring {
  readonly parts: CodePart[];
  readonly lines: (readonly SyntaxRange[] | undefined)[];
  done(): Promise<void>;
  edit(from: number, removed: number, lines: readonly string[]): void;
}

function coloring(language: string, text: string): Coloring {
  const parts: CodePart[] = [];
  const lines: (readonly SyntaxRange[] | undefined)[] = [];
  let finished: (() => void) | undefined;
  const session = colorEdited(language, text.split('\n'), (part) => {
    if (part === undefined) {
      finished?.();
      return;
    }
    parts.push(part);
    const colored: LineRanges = partLines(part);
    colored.forEach((ranges, index) => {
      lines[part.from + index] = ranges;
    });
    if (part.done) {
      finished?.();
    }
  });
  return {
    parts,
    lines,
    done: () =>
      new Promise((resolve) => {
        finished = resolve;
      }),
    edit: (from, removed, inserted) => {
      lines.splice(
        from,
        removed,
        ...inserted.map((): readonly SyntaxRange[] | undefined => undefined),
      );
      session.edit(from, removed, inserted);
    },
  };
}

const kinds = (ranges: readonly SyntaxRange[] | undefined) =>
  (ranges ?? []).map(({ kind }) => kind);

suite('Colors of the text edited', () => {
  test('colors the lines of the text as code of its language, sending them in parts, the last done, and nothing of an unknown language', async () => {
    const colored = coloring('ts', 'const a = 1;\n// done');
    await colored.done();
    assert.deepStrictEqual(colored.lines[0]?.[0], {
      start: 0,
      end: 5,
      kind: 'keyword',
    });
    assert.deepStrictEqual(kinds(colored.lines[1]), ['comment']);
    assert.strictEqual(colored.parts.at(-1)?.done, true);
    const unknown = coloring('no-such-language', 'a');
    await unknown.done();
    assert.deepStrictEqual(unknown.parts, []);
  });

  test('colors again only the lines from the one edited up to the first whose state is as it was, a comment opened coloring every line after it', async () => {
    const colored = coloring('ts', 'let a;\nlet b;\nlet c;\nlet d;');
    await colored.done();
    colored.parts.length = 0;

    colored.edit(1, 1, ['let b = 2;']);
    await colored.done();
    assert.deepStrictEqual(
      colored.parts.map(({ from, ends }) => [from, ends.length]),
      [[1, 1]],
    );
    colored.parts.length = 0;

    colored.edit(1, 1, ['/* let b;']);
    await colored.done();
    assert.deepStrictEqual(
      [1, 2, 3].map((line) => kinds(colored.lines[line])),
      [['comment'], ['comment'], ['comment']],
    );
    assert.deepStrictEqual(kinds(colored.lines[0]), ['keyword', 'keyword']);
  });

  test('takes in edits that come while it colors, coloring each line as the text is once they are all in', async () => {
    const text = Array.from({ length: 3000 }, (_, at) => `let v${at} = ${at};`);
    const colored = coloring('ts', text.join('\n'));
    colored.edit(0, 1, ['/*']);
    colored.edit(2000, 1, ['*/ let after = 1;']);
    await colored.done();
    assert.deepStrictEqual(kinds(colored.lines[1]), ['comment']);
    assert.deepStrictEqual(kinds(colored.lines[1999]), ['comment']);
    assert.strictEqual(colored.lines[2000]?.[0]?.kind, 'comment');
    assert.ok(kinds(colored.lines[2001]).includes('keyword'));
  });
});

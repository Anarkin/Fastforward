import type { TextRequest } from '../shared/protocol';
import { textKey, type DiffFile } from './diff';
import { rendersImage, rendersWholeImage, type Side } from './images';

export type Preview = 'image' | 'markdown';

const markdownPath = /\.(?:md|markdown|mdown|mkdn?)$/i;

const sides: readonly Side[] = ['old', 'new'];

function rendersMarkdown(file: DiffFile): boolean {
  return (
    !file.binary &&
    file.placeholder === undefined &&
    markdownPath.test(file.path) &&
    sides.some((side) => file.blobs?.[side] !== undefined)
  );
}

export function previewOf(file: DiffFile): Preview | undefined {
  if (rendersImage(file)) {
    return 'image';
  }
  return rendersMarkdown(file) ? 'markdown' : undefined;
}

interface WholeFile {
  readonly path: string;
  readonly content: string;
  readonly binary: boolean;
}

export function wholePreviewOf(whole: WholeFile): Preview | undefined {
  if (rendersWholeImage(whole)) {
    return 'image';
  }
  return !whole.binary && markdownPath.test(whole.path)
    ? 'markdown'
    : undefined;
}

export function previewTexts(
  files: readonly DiffFile[],
  shown: ReadonlySet<string>,
  diff: number,
  requested: Set<string>,
): TextRequest[] {
  return files.flatMap((file) =>
    shown.has(file.path) && previewOf(file) === 'markdown'
      ? sides.flatMap((side) => {
          const blob = file.blobs?.[side];
          const key = `${diff}:${textKey(file.path, side)}`;
          if (blob === undefined || requested.has(key)) {
            return [];
          }
          requested.add(key);
          return [{ path: file.path, side, blob }];
        })
      : [],
  );
}

export interface MarkdownSide {
  readonly side: Side;
  readonly text: string | undefined;
  readonly present: boolean;
}

export function markdownSides(
  file: DiffFile,
  texts: ReadonlyMap<string, string>,
  sideBySide: boolean,
): MarkdownSide[] {
  const all = sides.map((side) => ({
    side,
    text: texts.get(textKey(file.path, side)),
    present: file.blobs?.[side] !== undefined,
  }));
  if (sideBySide) {
    return all;
  }
  const shown = all.find((side) => side.side === 'new' && side.present);
  return [shown ?? all[0]];
}

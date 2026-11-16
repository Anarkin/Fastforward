import { useLayoutEffect, useRef } from 'react';
import type { TextRequest } from '../shared/diffProtocol';
import type { DiffFile } from './diff';
import { textKey, type LoadedText } from './sideTexts';
import type { WholeFile } from './diffRows';
import { sidePlans } from './diffSyntaxSources';

export function textsToLoad(
  files: readonly DiffFile[],
  diff: number,
  requested: Set<string>,
  open?: ReadonlySet<number>,
  texts: ReadonlyMap<string, LoadedText> = new Map(),
  chosen?: string,
): TextRequest[] {
  const ofDiff = `${diff}:`;
  for (const key of requested) {
    if (!key.startsWith(ofDiff)) {
      requested.delete(key);
    }
  }
  return sidePlans(files, open, chosen).flatMap(({ file, side, wholeText }) => {
    const blob = file.blobs?.[side];
    const key = `${ofDiff}${textKey(file.path, side)}`;
    if (
      !wholeText ||
      !blob ||
      requested.has(key) ||
      texts.get(textKey(file.path, side))?.blob === blob
    ) {
      return [];
    }
    requested.add(key);
    return [{ path: file.path, side, blob }];
  });
}

export function useTextsToLoad(
  files: readonly DiffFile[],
  whole: WholeFile | undefined,
  diff: number,
  open: ReadonlySet<number>,
  texts: ReadonlyMap<string, LoadedText>,
  chosen: string | undefined,
  onLoadTexts: (texts: TextRequest[]) => void,
): void {
  const requested = useRef(new Set<string>());
  useLayoutEffect(() => {
    const load = whole
      ? []
      : textsToLoad(files, diff, requested.current, open, texts, chosen);
    if (load.length > 0) {
      onLoadTexts(load);
    }
  }, [files, whole, diff, open, texts, onLoadTexts, chosen]);
}

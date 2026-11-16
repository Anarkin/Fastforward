import { useCallback } from 'react';
import { useShell } from '../../../shell/page/store';
import { Diff, type DiffProps } from '../../../components/diff/page/diffColumn';
import type { DiffPlace } from '../../../components/diff/page/diffPlace';
import { diffFindOf, pickedFor } from '../../../components/diff/page/diffSlice';
import { useGit, useGitActions } from './store';

export function GitDiff({
  languageKey,
  ...shown
}: Omit<DiffProps, 'look' | 'measures' | 'measuring' | 'tab'> & {
  readonly languageKey?: string;
}) {
  const { scope, selection } = shown;
  const sideBySide = useGit((state) => state.diffLayout === 'sideBySide');
  const root = useGit((state) => state.tab.root);
  const language = useGit(pickedFor(languageKey));
  const measures = useGit((state) => state.diffMeasures);
  const find = useGit(diffFindOf(scope));
  const wordWrap = useShell((state) => state.textView.wordWrap);
  const showWhitespace = useShell((state) => state.textView.showWhitespace);
  const highlightSyntax = useShell((state) => state.textView.highlightSyntax);
  const scrolling = useShell((state) => state.scrolling);
  const {
    measureDiffText,
    snapDiffCode,
    keepWrapColumns,
    keepDiffFind,
    closeDiffFind,
    diffPlaceOf,
    keepDiffPlace,
  } = useGitActions();
  const keepPlace = useCallback(
    (change: Partial<DiffPlace>) => keepDiffPlace(scope, selection, change),
    [keepDiffPlace, scope, selection],
  );
  return (
    <Diff
      {...shown}
      look={{
        sideBySide,
        wordWrap,
        showWhitespace,
        highlightSyntax,
        scrolling,
        root,
        language,
      }}
      measures={measures}
      measuring={{
        measureText: measureDiffText,
        snapCode: snapDiffCode,
        keepWrapColumns,
      }}
      tab={{
        find,
        keepFind: (next) => keepDiffFind(scope, next),
        closeFind: () => closeDiffFind(scope),
        place: diffPlaceOf(scope, selection),
        keepPlace,
      }}
    />
  );
}
